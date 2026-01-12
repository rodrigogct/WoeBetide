from django.contrib import admin
from .models import HomepageSection, About

# Register your models here.

class AdminHomepageSection(admin.ModelAdmin): 
    readonly_fields=('created','updated')
admin.site.register(HomepageSection, AdminHomepageSection)

class AdminAbout(admin.ModelAdmin): 
    readonly_fields=('created','updated')
admin.site.register(About, AdminAbout)
