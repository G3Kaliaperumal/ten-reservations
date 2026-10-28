import uuid

from django.db import models
from django.db.models import F, Q
from django.utils import timezone


class Member(models.Model):
    name = models.CharField(max_length=100)
    surname = models.CharField(max_length=100)
    # Includes imported bookings, for which the CSV contains no individual records.
    booking_count = models.PositiveIntegerField(default=0)
    date_joined = models.DateTimeField()

    class Meta:
        ordering = ["name", "surname", "pk"]
        constraints = [models.CheckConstraint(condition=Q(booking_count__gte=0), name="member_count_nonnegative")]

    def __str__(self):
        return f"{self.name} {self.surname} (#{self.pk})"


class InventoryItem(models.Model):
    title = models.CharField(max_length=200)
    description = models.TextField()
    remaining_count = models.PositiveIntegerField()
    expiration_date = models.DateField()

    class Meta:
        ordering = ["title", "pk"]
        constraints = [models.CheckConstraint(condition=Q(remaining_count__gte=0), name="inventory_count_nonnegative")]

    def __str__(self):
        return f"{self.title} (#{self.pk})"

    @property
    def is_expired(self):
        return self.expiration_date < timezone.localdate()


class Booking(models.Model):
    reference = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    member = models.ForeignKey(Member, on_delete=models.PROTECT, related_name="bookings")
    item = models.ForeignKey(InventoryItem, on_delete=models.PROTECT, related_name="bookings")
    booked_at = models.DateTimeField(default=timezone.now, editable=False)
    cancelled_at = models.DateTimeField(null=True, blank=True, editable=False)

    class Meta:
        ordering = ["-booked_at", "reference"]
        indexes = [models.Index(fields=["member", "cancelled_at"], name="booking_member_status_idx")]
        constraints = [models.CheckConstraint(
            condition=Q(cancelled_at__isnull=True) | Q(cancelled_at__gte=F("booked_at")),
            name="cancellation_after_booking",
        )]

    @property
    def status(self):
        return "cancelled" if self.cancelled_at else "active"


class DataImport(models.Model):
    """Singleton receipt prevents a repeated seed from resetting live counters."""
    fingerprint = models.CharField(max_length=64)
    imported_at = models.DateTimeField(default=timezone.now)
    member_count = models.PositiveIntegerField()
    item_count = models.PositiveIntegerField()
