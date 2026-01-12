from django.db import models
import os
from io import BytesIO
from PIL import Image, ExifTags
from django.core.files.base import ContentFile
from django.db import models
from django.conf import settings

# Create your models here.

class HomepageSection(models.Model):
    SECTION_CHOICES = [
        ('menu', 'Menu'),
        ('shop_all', 'Shop All'),
        ('staff_picks', 'Staff Picks'),
        ('tees', 'Tees'),
        ('sweatshirts', 'Sweatshirts'),
        ('outerwear', 'Outerwear'),
        ('archive', 'Archive'),
    ]

    section_type = models.CharField(max_length=20, choices=SECTION_CHOICES)
    img1 = models.ImageField(upload_to='menu/original', null=True, blank=True)
    img2 = models.ImageField(upload_to='menu/original', null=True, blank=True)
    img3 = models.ImageField(upload_to='menu/original', null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now_add=True)

    # def save(self, *args, **kwargs):
    #     from PIL import Image
    #     import os
    #     from io import BytesIO
    #     from django.conf import settings

    #     super().save(*args, **kwargs)

    #     # Same quality & size for all menu images
    #     quality = 70
    #     target_size = (1802, 1400)  # Width x Height

    #         # If it's an "about" section, use higher quality & bigger size
    #     if self.section_type == 'about':
    #         quality = 100
    #         target_size = (1800, 2160)

    #     for field_name in ['img1', 'img2', 'img3']:
    #         image_field = getattr(self, field_name)
    #         if image_field and hasattr(image_field, 'path') and os.path.isfile(image_field.path):
    #             try:
    #                 image_field.open()
    #                 img = Image.open(image_field)
    #                 img = img.convert('RGB')

    #                 # Resize while keeping aspect ratio
    #                 img.thumbnail(target_size, Image.Resampling.LANCZOS)

    #                 # Convert to WebP
    #                 webp_io = BytesIO()
    #                 img.save(webp_io, format='WEBP', quality=quality, method=6)  # method=6 = best compression

    #                 # Save WebP in "menu/webp/"
    #                 base_name = os.path.splitext(os.path.basename(image_field.name))[0]
    #                 webp_path = f'menu/webp/{base_name}.webp'
    #                 full_webp_path = os.path.join(settings.MEDIA_ROOT, webp_path)
    #                 os.makedirs(os.path.dirname(full_webp_path), exist_ok=True)

    #                 with open(full_webp_path, 'wb') as f:
    #                     f.write(webp_io.getvalue())

    #                 print(f"✅ Saved WebP: {webp_path}")

    #             except Exception as e:
    #                 print(f"⚠️ Error processing {field_name}: {e}")

    #     def __str__(self):
    #         return f"{self.get_section_type_display()} #{self.id}"

    #     class Meta:
    #         verbose_name = 'Homepage Section'
    #         verbose_name_plural = 'Homepage Sections'

    def save(self, *args, **kwargs):
        from PIL import Image, ImageCms
        import os
        from io import BytesIO
        from django.conf import settings
        import io

        super().save(*args, **kwargs)

        # Same quality & size for all menu images
        quality = 80
        target_size = (1400, 1050)  # Width x Height

        # If it's an "about" section, use higher quality & bigger size
        if self.section_type == 'menu':
            quality = 100
            target_size = (1400, 1680)

        # --- Color profile setup (same as Item.save) ---
        SRGB = ImageCms.createProfile("sRGB")
        SRGB_BYTES = ImageCms.ImageCmsProfile(SRGB).tobytes()

        def convert_to_srgb(img: Image.Image) -> Image.Image:
            icc = img.info.get("icc_profile")
            img = img.convert("RGB")
            if icc:
                try:
                    src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
                    img = ImageCms.profileToProfile(img, src, SRGB, outputMode="RGB")
                except Exception:
                    pass
            return img
        # ----------------------------------------------

        for field_name in ['img1', 'img2', 'img3']:
            image_field = getattr(self, field_name)
            if image_field and hasattr(image_field, 'path') and os.path.isfile(image_field.path):
                try:
                    image_field.open()
                    img = Image.open(image_field)

                    # >>> Normalize colors to sRGB
                    img = convert_to_srgb(img)

                    # Resize while keeping aspect ratio
                    img.thumbnail(target_size, Image.Resampling.LANCZOS)

                    # Convert to WebP with embedded ICC profile
                    webp_io = BytesIO()
                    img.save(
                        webp_io,
                        format='WEBP',
                        quality=quality,
                        method=6,
                        icc_profile=SRGB_BYTES,   # <— keeps correct color
                    )

                    # Save WebP in "menu/webp/"
                    base_name = os.path.splitext(os.path.basename(image_field.name))[0]
                    webp_path = f'menu/webp/{base_name}.webp'
                    full_webp_path = os.path.join(settings.MEDIA_ROOT, webp_path)
                    os.makedirs(os.path.dirname(full_webp_path), exist_ok=True)

                    with open(full_webp_path, 'wb') as f:
                        f.write(webp_io.getvalue())

                    print(f"✅ Saved WebP with ICC: {webp_path}")

                except Exception as e:
                    print(f"⚠️ Error processing {field_name}: {e}")

    def __str__(self):
        return f"{self.get_section_type_display()} #{self.id}"
    
    class Meta:
        verbose_name = 'Homepage Section'
        verbose_name_plural = 'Homepage Sections'

class About(models.Model):
    PAGE_CHOICES = [
        ('about', 'About'),
        ('shipping', 'Shipping & Returns'),
        ('terms', 'Terms of Service'),
        ('privacy', 'Privacy Policy'),
    ]

    page_key = models.CharField(max_length=20, choices=PAGE_CHOICES, unique=True)
    title = models.CharField(max_length=100)
    content = models.TextField()

    # Optional fields for the "about" page
    image = models.ImageField(upload_to='info/', null=True, blank=True)
    subtitle = models.CharField(max_length=200, blank=True, null=True)

    created = models.DateTimeField(auto_now_add=True)
    updated = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.get_page_key_display()

