from import_export import resources
from .models import Garment

class GarmentResource(resources.ModelResource):
    class Meta:
        model = Garment
        fields = (
            "id",
            "garment_id",
            "collection",
            "name",
            "category",
            "brand",
            "size",
            "era",
            "cost",
            "listed_price",
            "condition",
            "description",
            "measurements",
            "notes",
            "status",
            "is_visible_on_site",
        )