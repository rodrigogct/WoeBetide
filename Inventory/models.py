from django.db import models
from django.contrib.auth.models import User

# Create your models here.
class Collection(models.Model):
    collection_id = models.CharField(max_length=20, unique=True)
    date_bought = models.DateField()
    source = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)

    def __str__(self):
        return self.collection_id

class Garment(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        AVAILABLE = "available", "Available"
        PUBLISHED = "published", "Published"
        RESERVED = "reserved", "Reserved"
        SOLD = "sold", "Sold"
        ARCHIVE = "archive", "Archive"

    class Category(models.TextChoices):
        TSHIRT = "tshirt", "T-shirt"
        SWEATSHIRT = "sweatshirt", "Sweatshirt"
        HOODIE = "hoodie", "Hoodie"
        JACKET = "jacket", "Jacket"
        PANTS = "pants", "Pants"
        JEWELRY = "jewelry", "Jewelry"
        OTHER = "other", "Other"

    garment_id = models.CharField(max_length=40, unique=True, blank=True)

    collection = models.ForeignKey(
        Collection,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="garments"
    )

    name = models.CharField(max_length=200)
    category = models.CharField(max_length=30, choices=Category.choices)
    brand = models.CharField(max_length=120, blank=True)
    size = models.CharField(max_length=40, blank=True)
    era = models.CharField(max_length=60, blank=True)

    cost = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    listed_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    sold_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)

    condition = models.CharField(max_length=200, blank=True)
    description = models.TextField(blank=True)
    measurements = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.DRAFT
    )

    is_visible_on_site = models.BooleanField(default=False)
    staff_pick = models.BooleanField(default=False)
    is_featured = models.BooleanField(default=False)

    img1 = models.ImageField(upload_to="garments/", blank=True, null=True)
    img2 = models.ImageField(upload_to="garments/", blank=True, null=True)
    img3 = models.ImageField(upload_to="garments/", blank=True, null=True)
    img4 = models.ImageField(upload_to="garments/", blank=True, null=True)
    img5 = models.ImageField(upload_to="garments/", blank=True, null=True)
    img6 = models.ImageField(upload_to="garments/", blank=True, null=True)
    img7 = models.ImageField(upload_to="garments/", blank=True, null=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def save(self, *args, **kwargs):
        if not self.garment_id and self.collection:
            count = Garment.objects.filter(collection=self.collection).count() + 1
            self.garment_id = f"WB-{self.collection.collection_id}-{count:03d}"
        super().save(*args, **kwargs)

    @property
    def profit(self):
        if self.sold_price is None:
            return None
        return self.sold_price - self.cost

    def __str__(self):
        return f"{self.garment_id} - {self.name}"
    
class Sale(models.Model):
    class Channel(models.TextChoices):
        WEBSITE = "website", "Website"
        POPUP = "popup", "Pop-up"
        INSTAGRAM = "instagram", "Instagram"
        PHYSICAL = "physical", "Physical"
        OTHER = "other", "Other"

    sale_id = models.CharField(max_length=30, unique=True)
    sale_date = models.DateField()
    channel = models.CharField(max_length=30, choices=Channel.choices)
    customer_name = models.CharField(max_length=120, blank=True)
    notes = models.TextField(blank=True)

    created_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True
    )

    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.sale_id

class SaleItem(models.Model):
    sale = models.ForeignKey(Sale, on_delete=models.CASCADE, related_name="items")
    garment = models.OneToOneField(Garment, on_delete=models.PROTECT)
    sold_price = models.DecimalField(max_digits=10, decimal_places=2)

    def __str__(self):
        return f"{self.sale.sale_id} - {self.garment.name}"

class Payment(models.Model):
    sale = models.OneToOneField(Sale, on_delete=models.CASCADE, related_name="payment")

    cash = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    clip = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    card = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    transfer = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    fees = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    @property
    def gross_total(self):
        return self.cash + self.clip + self.card + self.transfer

    @property
    def net_total(self):
        return self.gross_total - self.fees

    def __str__(self):
        return f"Payment for {self.sale.sale_id}"