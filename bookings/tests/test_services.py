from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.db import OperationalError
from django.test import TestCase
from django.utils import timezone

from bookings.models import Booking, InventoryItem, Member
from bookings.services import BookingError, book_item, cancel_booking


class BookingServiceTests(TestCase):
    def setUp(self):
        self.member = Member.objects.create(name="Emily", surname="Johnson", booking_count=0, date_joined=timezone.now())
        self.item = InventoryItem.objects.create(title="Bali", description="A trip", remaining_count=3, expiration_date=date(2030, 11, 19))

    def counts(self):
        self.member.refresh_from_db()
        self.item.refresh_from_db()
        return self.member.booking_count, self.item.remaining_count

    def test_booking_records_reference_timestamp_and_counters(self):
        before = timezone.now()
        booking = book_item(member_id=self.member.pk, item_id=self.item.pk)
        self.assertIsNotNone(booking.reference)
        self.assertGreaterEqual(booking.booked_at, before)
        self.assertEqual(booking.status, "active")
        self.assertEqual(self.counts(), (1, 2))

    def test_two_allowed_third_rejected(self):
        for _ in range(2):
            book_item(member_id=self.member.pk, item_id=self.item.pk)
        with self.assertRaisesMessage(BookingError, "limit of 2"):
            book_item(member_id=self.member.pk, item_id=self.item.pk)
        self.assertEqual(self.counts(), (2, 1))
        self.assertEqual(Booking.objects.count(), 2)

    def test_legacy_count_above_limit_is_preserved_and_blocked(self):
        self.member.booking_count = 3
        self.member.save()
        with self.assertRaises(BookingError):
            book_item(member_id=self.member.pk, item_id=self.item.pk)
        self.assertEqual(self.counts(), (3, 3))

    def test_empty_stock_rolls_back_member_increment(self):
        self.item.remaining_count = 0
        self.item.save()
        with self.assertRaisesMessage(BookingError, "no remaining"):
            book_item(member_id=self.member.pk, item_id=self.item.pk)
        self.assertEqual(self.counts(), (0, 0))
        self.assertFalse(Booking.objects.exists())

    def test_insert_failure_rolls_back_both_counters(self):
        with patch("bookings.services.Booking.objects.create", side_effect=RuntimeError("write failed")):
            with self.assertRaises(RuntimeError):
                book_item(member_id=self.member.pk, item_id=self.item.pk)
        self.assertEqual(self.counts(), (0, 3))

    def test_unknown_member_or_item_does_not_change_data(self):
        for ids, code in [({"member_id": 999, "item_id": self.item.pk}, "member_not_found"), ({"member_id": self.member.pk, "item_id": 999}, "item_not_found")]:
            with self.subTest(code=code), self.assertRaises(BookingError) as caught:
                book_item(**ids)
            self.assertEqual(caught.exception.code, code)
        self.assertEqual(self.counts(), (0, 3))

    def test_expired_experience_is_rejected_without_counter_changes(self):
        self.item.expiration_date = date(2000, 1, 1)
        self.item.save()
        with self.assertRaises(BookingError) as caught:
            book_item(member_id=self.member.pk, item_id=self.item.pk)
        self.assertEqual(caught.exception.code, "experience_expired")
        self.assertEqual(caught.exception.status, 409)
        self.assertEqual(self.counts(), (0, 3))
        self.assertFalse(Booking.objects.exists())

    def test_expiry_date_itself_remains_bookable(self):
        self.item.expiration_date = timezone.localdate()
        self.item.save()
        book_item(member_id=self.member.pk, item_id=self.item.pk)
        self.assertEqual(self.counts(), (1, 2))

    def test_cancellation_after_expiry_still_restores_counters_once(self):
        booking = book_item(member_id=self.member.pk, item_id=self.item.pk)
        self.item.expiration_date = date(2000, 1, 1)
        self.item.save(update_fields=["expiration_date"])
        cancel_booking(member_id=self.member.pk, booking_reference=booking.reference)
        self.assertEqual(self.counts(), (0, 3))
        with self.assertRaises(BookingError):
            cancel_booking(member_id=self.member.pk, booking_reference=booking.reference)
        self.assertEqual(self.counts(), (0, 3))

    def test_cancel_restores_capacity_preserves_record(self):
        booking = book_item(member_id=self.member.pk, item_id=self.item.pk)
        result = cancel_booking(member_id=self.member.pk, booking_reference=booking.reference)
        self.assertEqual(result.status, "cancelled")
        self.assertIsNotNone(result.cancelled_at)
        self.assertEqual(self.counts(), (0, 3))
        self.assertEqual(Booking.objects.count(), 1)

    def test_repeated_cancel_does_not_restore_twice(self):
        booking = book_item(member_id=self.member.pk, item_id=self.item.pk)
        cancel_booking(member_id=self.member.pk, booking_reference=booking.reference)
        with self.assertRaisesMessage(BookingError, "already been cancelled"):
            cancel_booking(member_id=self.member.pk, booking_reference=booking.reference)
        self.assertEqual(self.counts(), (0, 3))

    def test_wrong_member_cannot_cancel(self):
        booking = book_item(member_id=self.member.pk, item_id=self.item.pk)
        with self.assertRaises(BookingError) as caught:
            cancel_booking(member_id=999, booking_reference=booking.reference)
        self.assertEqual(caught.exception.status, 404)
        self.assertEqual(self.counts(), (1, 2))
        booking.refresh_from_db()
        self.assertIsNone(booking.cancelled_at)

    def test_unknown_reference_returns_not_found(self):
        with self.assertRaises(BookingError) as caught:
            cancel_booking(member_id=self.member.pk, booking_reference=uuid4())
        self.assertEqual(caught.exception.status, 404)

    def test_cancel_allows_a_new_booking_with_imported_baseline(self):
        self.member.booking_count = 1
        self.member.save()
        booking = book_item(member_id=self.member.pk, item_id=self.item.pk)
        cancel_booking(member_id=self.member.pk, booking_reference=booking.reference)
        book_item(member_id=self.member.pk, item_id=self.item.pk)
        self.assertEqual(self.counts(), (2, 2))

    def test_inconsistent_count_rolls_back_cancellation(self):
        booking = book_item(member_id=self.member.pk, item_id=self.item.pk)
        Member.objects.filter(pk=self.member.pk).update(booking_count=0)
        with self.assertRaisesMessage(BookingError, "investigation"):
            cancel_booking(member_id=self.member.pk, booking_reference=booking.reference)
        booking.refresh_from_db()
        self.assertIsNone(booking.cancelled_at)
        self.assertEqual(self.counts(), (0, 2))

    def test_lock_timeout_is_a_retryable_domain_error(self):
        with patch("bookings.services.Member.objects.filter", side_effect=OperationalError("database is locked")):
            with self.assertRaises(BookingError) as caught:
                book_item(member_id=self.member.pk, item_id=self.item.pk)
        self.assertEqual(caught.exception.code, "database_busy")
        self.assertEqual(caught.exception.status, 503)

    def test_other_database_errors_are_not_hidden(self):
        with patch("bookings.services.Member.objects.filter", side_effect=OperationalError("no such table")):
            with self.assertRaises(OperationalError):
                book_item(member_id=self.member.pk, item_id=self.item.pk)
