"""Secure source-workbook download view for the WOE BETIDE dashboard."""

from django.contrib.auth.decorators import login_required
from django.http import FileResponse, Http404
from django.shortcuts import render
from django.utils.http import content_disposition_header
from io import BytesIO

from .models import SourceWorkbook


@login_required
def download_source_excel(request):
    """Download exactly the most recently successfully imported source workbook."""
    source = SourceWorkbook.objects.order_by('-imported_at', '-pk').first()
    if source is None:
        raise Http404('No source workbook has been imported and saved yet.')

    file_obj = BytesIO(bytes(source.file_data))
    # FileResponse streams bytes without depending on Railway's ephemeral filesystem.
    response = FileResponse(file_obj, content_type=source.content_type)
    response['Content-Disposition'] = content_disposition_header(
        as_attachment=True, filename=source.filename
    )
    response['Cache-Control'] = 'private, no-store'
    response['X-Content-Type-Options'] = 'nosniff'
    return response
