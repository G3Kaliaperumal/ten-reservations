import io
import tempfile
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase

from bookings.models import DataImport, InventoryItem, Member
from bookings.services import book_item


class ImportTests(TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.members = Path(self.directory.name) / "members.csv"
        self.inventory = Path(self.directory.name) / "inventory.csv"
        self.members.write_bytes((settings.BASE_DIR / "members.csv").read_bytes())
        self.inventory.write_bytes((settings.BASE_DIR / "inventory.csv").read_bytes())

    def load(self):
        output = io.StringIO()
        call_command("load_data", members=self.members, inventory=self.inventory, stdout=output)
        return output.getvalue()

    def test_supplied_data_is_loaded_without_merging_duplicates(self):
        self.assertIn("45 members and 15", self.load())
        self.assertEqual(Member.objects.count(), 45)
        self.assertEqual(InventoryItem.objects.count(), 15)
        self.assertEqual(Member.objects.filter(name="Grace", surname="Miller").count(), 2)
        self.assertEqual(InventoryItem.objects.filter(title="London").count(), 2)
        self.assertTrue(Member.objects.filter(name="James").exists())
        self.assertEqual(Member.objects.filter(booking_count=3).count(), 3)
        self.assertEqual(InventoryItem.objects.get(title="Hot air balloon").expiration_date.year, 2021)
        self.assertIsNotNone(Member.objects.first().date_joined.tzinfo)

    def test_repeat_import_preserves_new_bookings_and_counts(self):
        self.load()
        member = Member.objects.filter(booking_count=0).first()
        item = InventoryItem.objects.get(title="Bali")
        book_item(member_id=member.pk, item_id=item.pk)
        self.assertIn("already loaded", self.load())
        item.refresh_from_db()
        member.refresh_from_db()
        self.assertEqual(item.remaining_count, 4)
        self.assertEqual(member.booking_count, 1)
        self.assertEqual(Member.objects.count(), 45)

    def test_changed_input_cannot_overwrite_live_state(self):
        self.load()
        self.members.write_text(self.members.read_text(encoding="utf-8-sig").replace("Sophie", "Sophia"), encoding="utf-8")
        with self.assertRaisesMessage(CommandError, "Different input"):
            self.load()
        self.assertTrue(Member.objects.filter(name="Sophie").exists())

    def test_bad_inventory_writes_neither_file(self):
        self.inventory.write_text("title,description,remaining_count,expiration_date\nBali,trip,-1,19/11/2030\n", encoding="utf-8")
        with self.assertRaisesMessage(CommandError, "inventory, row 2"):
            self.load()
        self.assertFalse(Member.objects.exists())
        self.assertFalse(InventoryItem.objects.exists())
        self.assertFalse(DataImport.objects.exists())

    def test_bad_member_rows_empty_files_and_headers(self):
        for content in ["wrong,headers\n", "name,surname,booking_count,date_joined\n", "name,surname,booking_count,date_joined\nA,B,1\n", "name,surname,booking_count,date_joined\nA,B,0,not-a-date\n", "name,surname,booking_count,date_joined\nA,B,1.5,2024-01-01T12:00:00\n"]:
            with self.subTest(content=content):
                self.members.write_text(content, encoding="utf-8")
                with self.assertRaises(CommandError):
                    self.load()
                self.assertFalse(Member.objects.exists())

    def test_invalid_expiry_and_missing_file(self):
        self.inventory.write_text("title,description,remaining_count,expiration_date\nBali,trip,1,31/02/2030\n", encoding="utf-8")
        with self.assertRaisesMessage(CommandError, "inventory, row 2"):
            self.load()
        self.inventory.unlink()
        with self.assertRaisesMessage(CommandError, "Could not read"):
            self.load()

    def test_nonempty_unmarked_database_is_not_overwritten(self):
        InventoryItem.objects.create(title="Existing", description="Keep", remaining_count=3, expiration_date="2030-01-01")
        with self.assertRaisesMessage(CommandError, "not empty"):
            self.load()
        self.assertEqual(InventoryItem.objects.count(), 1)

    def test_utf8_bom_is_supported(self):
        self.members.write_bytes(b"\xef\xbb\xbf" + self.members.read_text(encoding="utf-8-sig").encode("utf-8"))
        self.load()
        self.assertEqual(Member.objects.count(), 45)
