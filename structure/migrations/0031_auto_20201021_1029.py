# Generated by Django 3.0.3 on 2020-10-21 08:29

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('structure', '0030_remove_structure_extra_proteins'),
    ]

    operations = [
        migrations.AlterField(
            model_name='structureextraproteins',
            name='structure',
            field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='extra_proteins', to='structure.Structure'),
        ),
    ]
