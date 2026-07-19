from django.db import models
import os
from PIL import Image
from django.core.files.base import ContentFile
from django.db import models
from django.conf import settings

# Create your models here.

class Item(models.Model):

    CATEGORY_CHOICES = [
        ('Tees', 'Tee'),
        ('Jackets', 'Jacket'),
        ('Sweatshirts', 'Sweatshirt'),
    ]

    SIZE_CHOICES = [
        ('XS', 'XS'),
        ('S', 'S'),
        ('M', 'M'),
        ('L', 'L'),
        ('XL', 'XL'),
        ('XXL', 'XXL'),
    ]
           
    # 1. Basic info
    name = models.CharField(max_length=50)

    # 2. Category/flags
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default='Tee')
    staff_pick = models.BooleanField(default=False, help_text="Check if this item is a staff pick.")
    is_featured = models.BooleanField(default=False, help_text="Check if item appears in the curated 'Just In' section.")
    is_sold = models.BooleanField(default=False, help_text="Check if this item has been sold")
    is_archive = models.BooleanField(default=False, help_text="Check if the item should go to archive or be removed.")
    sold_at = models.DateTimeField(null=True, blank=True, db_index=True)

    # 3. Price & description
    price = models.DecimalField(max_digits=10, decimal_places=2, default = 0,help_text="Price in MXN")
    sold_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    description = models.CharField(max_length=250,  null=True, blank=True,help_text="Information about the object")

    # 4. Sizing
    size = models.CharField(max_length=50, choices=SIZE_CHOICES, default='NA')
    width = models.CharField(max_length=50, default='NA', help_text="Width in cm")
    length = models.CharField(max_length=50, default='NA', help_text="Length in cm")
    sleeve = models.CharField(max_length=50, default='NA', help_text="Sleeve length in cm")

    # 5. Images
    img1_w = models.PositiveIntegerField(null=True, blank=True, editable=False)
    img1_h = models.PositiveIntegerField(null=True, blank=True, editable=False)

    img1 = models.ImageField(upload_to='catalogue/original', null=True, blank=True, max_length=500, help_text="Catalogue image")
    img2 = models.ImageField(upload_to='catalogue/original', null=True, blank=True, editable=False, max_length=500, help_text="Auto-generated (front-part)")
    img3 = models.ImageField(upload_to='catalogue/original', null=True, blank=True, max_length=500, help_text="Back")
    img4 = models.ImageField(upload_to='catalogue/original', null=True, blank=True, max_length=500, help_text="Zoom-in 1")
    img5 = models.ImageField(upload_to='catalogue/original', null=True, blank=True, max_length=500, help_text="Zoom-in 2")
    img6 = models.ImageField(upload_to='catalogue/original', null=True, blank=True, max_length=500, help_text="Zoom-in 3")
    img7 = models.ImageField(upload_to='catalogue/original', null=True, blank=True, max_length=500, help_text="Zoom-in 4")

    # 6. ID variant for each item
    shopify_variant_id = models.CharField(max_length=50, blank=True, null=True, help_text="Shopify Variant ID used for direct checkout")
    shopify_handle = models.CharField(max_length=100, blank=True, null=True, unique = True, help_text="Used to match products between Shopify and Django")

    # 7. Timestamps
    created = models.DateTimeField(auto_now_add=True)
    # updated = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    # Handle width, length, and sleeve in different units (cm/in)
    def width_in_inches(self):
        # Convert width from centimeters to inches
        try:
            centimeters = float(self.width)
            inches = round(centimeters / 2.54, 1)
            return inches
        except ValueError:
            return 'NA'

    def length_in_inches(self):
        # Convert length from centimeters to inches
        try:
            centimeters = float(self.length)
            inches = round(centimeters / 2.54, 1)
            return inches
        except ValueError:
            return 'NA'

    def sleeve_in_inches(self):
        try:
            centimeters = float(self.sleeve)
            return round(centimeters / 2.54, 1)
        except (ValueError, TypeError):
            return "NA"

    def save(self, *args, **kwargs):
        import os

        from django.core.files.base import ContentFile
        from django.utils import timezone

        # Auto-mark archived items as sold
        if self.is_archive and not self.is_sold:
            self.is_sold = True

            if not self.sold_at:
                self.sold_at = timezone.now()

        # First save img1 and the item
        super().save(*args, **kwargs)

        if not self.img1 or not getattr(self.img1, "name", ""):
            return

        base, ext = os.path.splitext(os.path.basename(self.img1.name))
        ext = (ext or ".jpg").lower()

        # Do not include catalogue/original here.
        # ImageField automatically applies upload_to.
        img2_filename = f"{base}__quality{ext}"

        img2_field = self._meta.get_field("img2")
        expected_img2_name = img2_field.generate_filename(
            self,
            img2_filename,
        )

        if self.img2 and self.img2.name == expected_img2_name:
            return

        # Remove the old derived copy
        if self.img2:
            self.img2.delete(save=False)

        self.img1.open("rb")

        try:
            image_data = self.img1.read()
        finally:
            self.img1.close()

        self.img2.save(
            img2_filename,
            ContentFile(image_data),
            save=False,
        )

        super().save(update_fields=["img2", "updated"])

class Jewelry(models.Model):

    JEWELRY_TYPE_CHOICES = [
        ("Necklace", "Necklace"),
    ]

    # 1. Basic info
    name = models.CharField(max_length=50)

    # 2. Category/flags
    jewelry_type = models.CharField(
        max_length=50,
        choices=JEWELRY_TYPE_CHOICES,
        default="Necklace"
    )
    staff_pick = models.BooleanField(default=False, help_text="Check if this jewelry item is a staff pick.")
    is_featured = models.BooleanField(default=False, help_text="Check if item appears in the curated 'Just In' section.")
    is_sold = models.BooleanField(default=False, help_text="Check if this item has been sold.")
    is_archive = models.BooleanField(default=False, help_text="Check if the item should go to archive or be removed.")
    sold_at = models.DateTimeField(null=True, blank=True, db_index=True)

    # 3. Price & description
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Price in MXN")
    sold_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    description = models.CharField(max_length=250, null=True, blank=True, help_text="Information about the object")

    # 4. Jewelry-specific details
    material = models.CharField(max_length=100, default="NA", help_text="Example: silver, stainless steel, brass")
    chain_length = models.CharField(max_length=50, default="NA", help_text="Chain length, e.g. 45 cm")
    pendant_size = models.CharField(max_length=50, default="NA", help_text="Pendant size, if applicable")
    condition = models.CharField(max_length=100, default="Vintage / pre-owned", help_text="Condition of the piece")

    # 5. Images
    img1_w = models.PositiveIntegerField(null=True, blank=True, editable=False)
    img1_h = models.PositiveIntegerField(null=True, blank=True, editable=False)

    img1 = models.ImageField(upload_to="jewelry/original", null=True, blank=True, max_length=500, help_text="Main jewelry image")
    img2 = models.ImageField(upload_to="jewelry/original", null=True, blank=True, editable=False, max_length=500, help_text="Auto-generated quality image")
    img3 = models.ImageField(upload_to="jewelry/original", null=True, blank=True, max_length=500, help_text="Additional image")
    img4 = models.ImageField(upload_to="jewelry/original", null=True, blank=True, max_length=500, help_text="Zoom-in 1")
    img5 = models.ImageField(upload_to="jewelry/original", null=True, blank=True, max_length=500, help_text="Zoom-in 2")
    img6 = models.ImageField(upload_to="jewelry/original", null=True, blank=True, max_length=500, help_text="Zoom-in 3")
    img7 = models.ImageField(upload_to="jewelry/original", null=True, blank=True, max_length=500, help_text="Zoom-in 4")

    # 6. Shopify
    shopify_variant_id = models.CharField(max_length=50, blank=True, null=True, help_text="Shopify Variant ID used for direct checkout")
    shopify_handle = models.CharField(max_length=100, blank=True, null=True, unique=True, help_text="Used to match products between Shopify and Django")

    # 7. Timestamps
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        import os
        from django.core.files.base import ContentFile
        from django.core.files.storage import default_storage
        from django.utils import timezone

        # Auto-mark sold if archived
        if self.is_archive and not self.is_sold:
            self.is_sold = True
            if not self.sold_at:
                self.sold_at = timezone.now()

        # Save first
        super().save(*args, **kwargs)

        # Auto-create/refresh img2 from img1
        if self.img1 and getattr(self.img1, "name", ""):
            base, ext = os.path.splitext(os.path.basename(self.img1.name))
            ext = (ext or ".jpg").lower()
            img2_name = f"jewelry/original/{base}__quality{ext}"

            if (not self.img2) or (self.img2.name != img2_name):
                self.img1.open("rb")
                data = self.img1.read()

                if default_storage.exists(img2_name):
                    default_storage.delete(img2_name)

                self.img2.save(img2_name, ContentFile(data), save=False)

                super().save(update_fields=["img2", "updated"])

    def __str__(self):
        return self.name
    name = models.CharField(max_length=50,default='NA')
    img1 = models.ImageField(upload_to='catalogue',null=True, blank=True, help_text="Front part of garment")
    img2 = models.ImageField(upload_to='catalogue',null=True, blank=True, help_text="Back part of garment")
    img3 = models.ImageField(upload_to='catalogue',null=True, blank=True, help_text="Zoom-in details of garment")
    img4 = models.ImageField(upload_to='catalogue',null=True, blank=True, help_text="Zoom-in details of garment")
    img5 = models.ImageField(upload_to='catalogue',null=True, blank=True, help_text="Zoom-in details of garment")
    img6 = models.ImageField(upload_to='catalogue',null=True, blank=True, help_text="Zoom-in details of garment")
    width = models.CharField(max_length=50, default='NA', help_text="Width in inches")
    length = models.CharField(max_length=50, default='NA', help_text="Length in inches")
    sleeve = models.CharField(max_length=50, default='NA', help_text="Sleeve length in inches")
    size = models.CharField(max_length=50, default='NA')
    price = models.CharField(max_length=50, default='NA', help_text="Price in MXN")
    description = models.CharField(max_length=250, default='NA', help_text="Information about the object")
    created=models.DateTimeField(auto_now_add=True)
    updated=models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name='Jewelry'
        verbose_name_plural='Jewelry'
     
    def __str__(self):
        return self.name