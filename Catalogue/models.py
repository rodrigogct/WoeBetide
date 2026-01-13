from django.db import models
import os
from io import BytesIO
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
    width = models.CharField(max_length=50, default='NA', help_text="Width in inches")
    length = models.CharField(max_length=50, default='NA', help_text="Length in inches")
    sleeve = models.CharField(max_length=50, default='NA', help_text="Sleeve length in inches")

    # 5. Images
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

    # Handle width and length in different units (in/cm)
    def width_in_cm(self):
        # Convert width from inches to centimeters
        try:
            inches = float(self.width)
            centimeters = round(inches * 2.54, 1)  # 1 inch = 2.54 cm, round to 1 decimal
            return centimeters
        except ValueError:
            return 'NA'  # Handle non-numeric input
    
    def length_in_cm(self):
        # Convert length from inches to centimeters
        try:
            inches = float(self.length)
            centimeters = round(inches * 2.54, 1)  # 1 inch = 2.54 cm, , round to 1 decimal
            return centimeters
        except ValueError:
            return 'NA'  # Handle non-numeric input  
    
    def sleeve_in_cm(self):
        # Convert sleeve length from inches to centimeters
        try: 
            inches = float(self.sleeve)
            centimeters = inches * 2.54  # 1 inch = 2.54 cm
            return centimeters
        except ValueError:
            return 'NA'  # Handle non-numeric input  
    
    # def save(self, *args, **kwargs):
    #     from slugify import slugify
    #     from PIL import Image, ExifTags, ImageCms
    #     import io, os
    #     from io import BytesIO
    #     from django.conf import settings
    #     from django.core.files.base import ContentFile
    #     from django.core.files.storage import default_storage 
    #     from django.utils import timezone

    #     is_new = self.pk is None

    #     # Auto-mark sold if archived
    #     if self.is_archive and not self.is_sold:
    #         self.is_sold = True
    #         if not self.sold_at:
    #             self.sold_at = timezone.now()

    #     # First save to ensure self.img1 has a path on disk
    #     super().save(*args, **kwargs)

    #     # ---------- AUTO-CREATE/REFRESH img2 FROM img1 ----------
    #     # If img1 exists, ensure img2 is a cloned file with a distinct name so WebP derivatives don't collide
    #     if self.img1 and hasattr(self.img1, "name"):
    #         base, ext = os.path.splitext(os.path.basename(self.img1.name))
    #         ext = ext.lower() or ".jpg"
    #         img2_name = f"{base}__quality{ext}" 

    #         # If img2 missing or not pointing to our derived name, (re)create it
    #         if not self.img2 or self.img2.name != img2_name:
    #             try:
    #                 # Read bytes from img1 and write them into img2 with the derived name
    #                 self.img1.open("rb")
    #                 data = self.img1.read()
    #                 # Overwrite safely if file exists
    #                 if default_storage.exists(img2_name):
    #                     default_storage.delete(img2_name)
    #                 self.img2.save(img2_name, ContentFile(data), save=False)  # <<< NEW >>>
    #             except Exception as e:
    #                 print(f" Could not clone img1 into img2: {e}")
        
    #     def _optimize_original(image_field, max_size=2000, quality=85):
    #         try:
    #             if not image_field or not hasattr(image_field, "path"):
    #                 return

    #             if not os.path.isfile(image_field.path):
    #                 return

    #             img = Image.open(image_field.path)

    #             # Fix EXIF orientation
    #             try:
    #                 exif = img._getexif()
    #                 if exif:
    #                     for tag in ExifTags.TAGS:
    #                         if ExifTags.TAGS[tag] == "Orientation":
    #                             o = exif.get(tag)
    #                             if o == 3:
    #                                 img = img.rotate(180, expand=True)
    #                             elif o == 6:
    #                                 img = img.rotate(270, expand=True)
    #                             elif o == 8:
    #                                 img = img.rotate(90, expand=True)
    #                             break
    #             except Exception:
    #                 pass

    #             # Convert to RGB + sRGB
    #             img = img.convert("RGB")

    #             # Resize (longest side = max_size)
    #             w, h = img.size
    #             scale = max(w, h) / max_size
    #             if scale > 1:
    #                 img = img.resize(
    #                     (int(w / scale), int(h / scale)),
    #                     Image.Resampling.LANCZOS,
    #                 )

    #             # Overwrite original file (THIS IS THE KEY)
    #             img.save(
    #                 image_field.path,
    #                 format="JPEG",
    #                 quality=quality,
    #                 optimize=True,
    #                 progressive=True,
    #             )

    #         except Exception as e:
    #             print(f"⚠️ Could not optimize original: {e}")

    #     # ---------- COLOR/WEBP PIPELINE ----------
    #     SRGB = ImageCms.createProfile("sRGB")
    #     SRGB_BYTES = ImageCms.ImageCmsProfile(SRGB).tobytes()

    #     def convert_to_srgb(img: Image.Image) -> Image.Image:
    #         icc = img.info.get("icc_profile")
    #         img = img.convert("RGB")
    #         if icc:
    #             try:
    #                 src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
    #                 img = ImageCms.profileToProfile(img, src, SRGB, outputMode="RGB")
    #             except Exception:
    #                 pass
    #         return img

    #     for field_name in ['img1','img2','img3','img4','img5','img6','img7']:
    #         image_field = getattr(self, field_name)
    #         if not (image_field and hasattr(image_field, 'path')):
    #             continue
    #         try:
    #             # Skip if source file not on disk
    #             if not os.path.isfile(image_field.path):
    #                 continue

    #             image_field.open()
    #             img = Image.open(image_field)

    #             # Fix EXIF orientation
    #             try:
    #                 exif = img._getexif()
    #                 if exif:
    #                     for tag in ExifTags.TAGS:
    #                         if ExifTags.TAGS[tag] == 'Orientation':
    #                             o = exif.get(tag)
    #                             if o == 3: img = img.rotate(180, expand=True)
    #                             elif o == 6: img = img.rotate(270, expand=True)
    #                             elif o == 8: img = img.rotate(90, expand=True)
    #                             break
    #             except Exception:
    #                 pass

    #             img = convert_to_srgb(img)

    #             # Quality & resize presets
    #             if field_name == 'img1':
    #                 quality = 80
    #                 target_size = (640, 853)  # size [60 - 80] kB
    #             elif field_name == 'img2':
    #                 quality = 80      
    #                 target_size = (960, 1280) # size [150 - 250] kB
    #             else:
    #                 quality = 80
    #                 target_size = (960, 1280)

    #             if target_size:
    #                 img.thumbnail(target_size, Image.Resampling.LANCZOS)

    #             # Save WebP derivative with embedded ICC
    #             webp_io = BytesIO()
    #             img.save(
    #                 webp_io,
    #                 format='WEBP',
    #                 quality=quality,
    #                 method=6,
    #                 icc_profile=SRGB_BYTES,
    #             )

    #             filename = os.path.basename(image_field.name)
    #             base, _ = os.path.splitext(filename)
    #             base_name = base
    #             # Each field gets its own distinct webp filename (thanks to img2 "__front" suffix)
    #             webp_name = f'{base_name}.webp'
    #             webp_path = f'catalogue/webp/{os.path.basename(webp_name)}'

    #             full_webp_path = os.path.join(settings.MEDIA_ROOT, webp_path)
    #             os.makedirs(os.path.dirname(full_webp_path), exist_ok=True)
    #             with open(full_webp_path, 'wb') as f:
    #                 f.write(webp_io.getvalue())

    #             # if not is_new:
    #             #     return

    #             print(f"✅ Saved WebP with ICC: {webp_path}")

    #         except Exception as e:
    #             print(f"⚠️ Error processing {field_name}: {e}")

    #     # Optimize original img1 ONCE (this becomes the new source of truth)
    #     _optimize_original(self.img1)

    #     # Persist img2 if we created/changed it above (no infinite loop; we don't re-run this block)
    #     super().save(update_fields=['img2', 'updated'])

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

        # Save first (uploads img1 to Cloudinary)
        super().save(*args, **kwargs)

        # Auto-create/refresh img2 from img1 (Cloudinary-safe)
        if self.img1 and getattr(self.img1, "name", ""):
            base, ext = os.path.splitext(os.path.basename(self.img1.name))
            ext = (ext or ".jpg").lower()
            img2_name = f"catalogue/original/{base}__quality{ext}"

            if (not self.img2) or (self.img2.name != img2_name):
                self.img1.open("rb")
                data = self.img1.read()

                if default_storage.exists(img2_name):
                    default_storage.delete(img2_name)

                self.img2.save(img2_name, ContentFile(data), save=False)

                super().save(update_fields=["img2", "updated"])

class Jewerly(models.Model):
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
        verbose_name='Jewerly'
        verbose_name_plural='Jewerly'
     
    def __str__(self):
        return self.name