"""Validate both CSVs fully, then seed an empty database in one transaction."""
import csv
import hashlib
import io
from datetime import datetime, timezone
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from bookings.models import Booking, DataImport, InventoryItem, Member


def rows(raw, columns, label):
    try:
        reader = csv.DictReader(io.StringIO(raw.decode("utf-8-sig")), strict=True)
        if reader.fieldnames != columns:
            raise CommandError(f"{label}: expected headers {','.join(columns)} in this order.")
        result = list(reader)
    except (UnicodeDecodeError, csv.Error) as exc:
        raise CommandError(f"{label}: invalid UTF-8 CSV: {exc}") from exc
    if not result:
        raise CommandError(f"{label}: file contains no data rows.")
    for number, row in enumerate(result, 2):
        if None in row or any(value is None for value in row.values()):
            raise CommandError(f"{label}, row {number}: incorrect number of columns.")
    return result


def text(value, limit=None):
    value = value.strip()
    if not value or (limit and len(value) > limit):
        raise ValueError(f"text must be nonempty{f' and at most {limit} characters' if limit else ''}")
    return value


def count(value):
    value = value.strip()
    if not value.isascii() or not value.isdigit() or int(value) > 2147483647:
        raise ValueError("counts must be nonnegative integers no greater than 2147483647")
    return int(value)


class Command(BaseCommand):
    help = "Load members.csv and inventory.csv into an empty database; safe to repeat with the same files."

    def add_arguments(self, parser):
        parser.add_argument("--members", type=Path, default=settings.BASE_DIR / "members.csv")
        parser.add_argument("--inventory", type=Path, default=settings.BASE_DIR / "inventory.csv")

    def handle(self, *args, **options):
        try:
            member_bytes = options["members"].read_bytes()
            item_bytes = options["inventory"].read_bytes()
        except OSError as exc:
            raise CommandError(f"Could not read input file: {exc}") from exc
        fingerprint = hashlib.sha256(hashlib.sha256(member_bytes).digest() + hashlib.sha256(item_bytes).digest()).hexdigest()

        members = []
        for number, row in enumerate(rows(member_bytes, ["name", "surname", "booking_count", "date_joined"], "members"), 2):
            try:
                joined = datetime.fromisoformat(row["date_joined"].strip())
                if joined.tzinfo is None:
                    joined = joined.replace(tzinfo=timezone.utc)
                members.append(Member(name=text(row["name"], 100), surname=text(row["surname"], 100), booking_count=count(row["booking_count"]), date_joined=joined))
            except ValueError as exc:
                raise CommandError(f"members, row {number}: {exc}") from exc

        items = []
        for number, row in enumerate(rows(item_bytes, ["title", "description", "remaining_count", "expiration_date"], "inventory"), 2):
            try:
                items.append(InventoryItem(title=text(row["title"], 200), description=text(row["description"]), remaining_count=count(row["remaining_count"]), expiration_date=datetime.strptime(row["expiration_date"].strip(), "%d/%m/%Y").date()))
            except ValueError as exc:
                raise CommandError(f"inventory, row {number}: {exc}") from exc

        with transaction.atomic():
            receipt = DataImport.objects.filter(pk=1).first()
            if receipt:
                if receipt.fingerprint != fingerprint:
                    raise CommandError("Different input files were already loaded. Use a new empty database; live counts will not be overwritten.")
                self.stdout.write("These exact files are already loaded; no data changed.")
                return
            if Member.objects.exists() or InventoryItem.objects.exists() or Booking.objects.exists():
                raise CommandError("The database is not empty. Refusing to overwrite existing application data.")
            Member.objects.bulk_create(members)
            InventoryItem.objects.bulk_create(items)
            DataImport.objects.create(pk=1, fingerprint=fingerprint, member_count=len(members), item_count=len(items))
        self.stdout.write(self.style.SUCCESS(f"Loaded {len(members)} members and {len(items)} inventory items."))
