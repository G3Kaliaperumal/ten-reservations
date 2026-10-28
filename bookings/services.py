"""The only application write path for booking/cancellation state transitions."""
from functools import wraps

from django.db import OperationalError, transaction
from django.db.models import F
from django.utils import timezone

from .models import Booking, InventoryItem, Member

MAX_BOOKINGS = 2


class BookingError(Exception):
    def __init__(self, code, message, status=409):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def database_errors(function):
    @wraps(function)
    def wrapped(*args, **kwargs):
        try:
            return function(*args, **kwargs)
        except OperationalError as exc:
            if "locked" not in str(exc).lower() and "busy" not in str(exc).lower():
                raise
            raise BookingError("database_busy", "The database is busy. Please try again.", 503) from exc
    return wrapped


@database_errors
@transaction.atomic
def book_item(*, member_id, item_id):
    if not Member.objects.filter(pk=member_id).exists():
        raise BookingError("member_not_found", "That member does not exist.", 404)
    item = InventoryItem.objects.filter(pk=item_id).first()
    if item is None:
        raise BookingError("item_not_found", "That inventory item does not exist.", 404)
    if item.expiration_date < timezone.localdate():
        raise BookingError("experience_expired", "This experience has expired and can no longer be booked.")

    if not Member.objects.filter(pk=member_id, booking_count__lt=MAX_BOOKINGS).update(booking_count=F("booking_count") + 1):
        raise BookingError("booking_limit", f"This member has reached the limit of {MAX_BOOKINGS} bookings.")
    if not InventoryItem.objects.filter(pk=item_id, remaining_count__gt=0).update(remaining_count=F("remaining_count") - 1):
        # Raising out of atomic also rolls back the member's increment.
        raise BookingError("out_of_stock", "This item has no remaining availability.")
    return Booking.objects.create(member_id=member_id, item_id=item_id)


@database_errors
@transaction.atomic
def cancel_booking(*, member_id, booking_reference):
    try:
        booking = Booking.objects.get(reference=booking_reference, member_id=member_id)
    except Booking.DoesNotExist:
        raise BookingError("booking_not_found", "No booking matches that reference and member.", 404) from None
    cancelled_at = timezone.now()
    changed = Booking.objects.filter(reference=booking_reference, cancelled_at__isnull=True).update(cancelled_at=cancelled_at)
    if not changed:
        raise BookingError("already_cancelled", "This booking has already been cancelled.")
    if not Member.objects.filter(pk=member_id, booking_count__gt=0).update(booking_count=F("booking_count") - 1):
        raise BookingError("inconsistent_count", "This member's booking count needs investigation.")
    InventoryItem.objects.filter(pk=booking.item_id).update(remaining_count=F("remaining_count") + 1)
    booking.cancelled_at = cancelled_at
    return booking
