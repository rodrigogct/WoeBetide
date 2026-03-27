from django.shortcuts import get_object_or_404, render
from .models import HomepageSection, About
from Catalogue.models import Item

# Create your views here.

# def menu(request):
#     items = Item.objects.all()
#     menu = HomepageSection.objects.filter(section_type='menu')
#     new_items = Item.objects.filter(is_featured = True).order_by('-created')[:4]
#     shop_all = HomepageSection.objects.filter(section_type='shop_all')
#     staff_picks =  HomepageSection.objects.filter(section_type='staff_picks')
#     tees = HomepageSection.objects.filter(section_type='tees')
#     sweatshirts = HomepageSection.objects.filter(section_type='sweatshirts')
#     outerwear = HomepageSection.objects.filter(section_type='outerwear')
#     archive = HomepageSection.objects.filter(section_type='archive')

#     about = About.objects.filter(page_key='about').first()

#     # If there aren't any or enough selected items, choose from latest.
#     if new_items.count() < 4:
#       remaining = 4 - new_items.count()
#       filler_items = Item.objects.filter(is_featured=False, is_sold=False).order_by('-created')[:remaining]
#       new_items = list(new_items) + list(filler_items)

#     return render(request, 'menu.html',
#                   { "items": items,
#                     "staff_picks": staff_picks,
#                     "new_items": new_items,
#                     "menu": menu,
#                     "shop_all" : shop_all,
#                     "tees" : tees,
#                     "sweatshirts" : sweatshirts,
#                     "outerwear" : outerwear,
#                     "archive": archive,
#                     "about": about})



def menu(request):
    items = Item.objects.all()

    # homepage blocks
    menu_sections = HomepageSection.objects.filter(section_type='menu')
    shop_all     = HomepageSection.objects.filter(section_type='shop_all')
    staff_picks  = HomepageSection.objects.filter(section_type='staff_picks')
    tees         = HomepageSection.objects.filter(section_type='tees')
    sweatshirts  = HomepageSection.objects.filter(section_type='sweatshirts')
    outerwear    = HomepageSection.objects.filter(section_type='outerwear')
    archive      = HomepageSection.objects.filter(section_type='archive')

    # ABOUT teaser comes from About model
    about = About.objects.filter(page_key='about').first()

    # featured "new items" (with fallback)
    new_items_qs = Item.objects.filter(is_featured=True, is_sold=False).order_by('-created')
    new_items = list(new_items_qs[:4])
    if len(new_items) < 4:
        remaining = 4 - len(new_items)
        filler = list(Item.objects.filter(is_featured=False, is_sold=False)
                               .order_by('-created')[:remaining])
        new_items += filler

    # collect its images (img1..img6)
    new_item = []
    if new_items:
        first = new_items[0]
        for f in ['img1', 'img2', 'img3', 'img4', 'img5', 'img6']:
            img = getattr(first, f, None)
            if img:
                new_item.append(img)

    return render(request, 'menu.html', {
        "items": items,

        "menu": menu_sections,
        "shop_all": shop_all,
        "staff_picks": staff_picks,
        "tees": tees,
        "sweatshirts": sweatshirts,
        "outerwear": outerwear,
        "archive": archive,

        "about": about,

        "new_items": new_items,       # grid of up to 4 cards
        "new_item": new_item,         # single hero piece (optional)
    })

def about(request, page):
    info = get_object_or_404(About, page_key=page)

    # Copy the logic from menu()
    new_items = Item.objects.filter(is_featured=True).order_by('-created')[:4]

    if new_items.count() < 4:
        remaining = 4 - new_items.count()
        filler_items = Item.objects.filter(is_featured=False, is_sold=False).order_by('-created')[:remaining]
        new_items = list(new_items) + list(filler_items)

    return render(request, 'about.html', {
        'info': info,
        'new_items': new_items
    })