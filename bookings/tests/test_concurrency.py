from concurrent.futures import ThreadPoolExecutor
from datetime import date
from threading import Barrier

from django.db import close_old_connections, connection
from django.test import TransactionTestCase
from django.utils import timezone

from bookings.models import Booking, InventoryItem, Member
from bookings.services import BookingError, book_item, cancel_booking


class ConcurrentBookingTests(TransactionTestCase):
    """Use real SQLite connections to compete for the same capacity."""
    def setUp(self):
        self.member = Member.objects.create(name="Emily", surname="Johnson", date_joined=timezone.now())
        self.other = Member.objects.create(name="Amelia", surname="Williams", date_joined=timezone.now())
        self.item = InventoryItem.objects.create(title="Bali", description="A trip", remaining_count=1, expiration_date=date(2030, 1, 1))

    def race(self, operations):
        self.assertNotIn("memory", str(connection.settings_dict["NAME"]))
        barrier = Barrier(len(operations))

        def run(operation):
            close_old_connections()
            try:
                barrier.wait(timeout=10)
                operation()
                return "success"
            except BookingError as exc:
                return exc.code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=len(operations)) as executor:
            return list(executor.map(run, operations))

    def test_last_place_has_only_one_winner(self):
        results = self.race([
            lambda: book_item(member_id=self.member.pk, item_id=self.item.pk),
            lambda: book_item(member_id=self.other.pk, item_id=self.item.pk),
        ])
        self.assertCountEqual(results, ["success", "out_of_stock"])
        self.item.refresh_from_db()
        self.assertEqual(self.item.remaining_count, 0)
        self.assertEqual(Booking.objects.count(), 1)
        self.assertEqual(sum(Member.objects.values_list("booking_count", flat=True)), 1)

    def test_member_last_slot_has_only_one_winner(self):
        Member.objects.filter(pk=self.member.pk).update(booking_count=1)
        InventoryItem.objects.filter(pk=self.item.pk).update(remaining_count=3)
        results = self.race([lambda: book_item(member_id=self.member.pk, item_id=self.item.pk) for _ in range(2)])
        self.assertCountEqual(results, ["success", "booking_limit"])
        self.member.refresh_from_db()
        self.item.refresh_from_db()
        self.assertEqual(self.member.booking_count, 2)
        self.assertEqual(self.item.remaining_count, 2)

    def test_competing_cancellations_restore_once(self):
        booking = book_item(member_id=self.member.pk, item_id=self.item.pk)
        results = self.race([lambda: cancel_booking(member_id=self.member.pk, booking_reference=booking.reference) for _ in range(2)])
        self.assertCountEqual(results, ["success", "already_cancelled"])
        self.member.refresh_from_db()
        self.item.refresh_from_db()
        self.assertEqual(self.member.booking_count, 0)
        self.assertEqual(self.item.remaining_count, 1)
