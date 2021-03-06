# Generated by Django 3.0.3 on 2020-06-04 15:35

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('ligand', '0003_analyzedassay_analyzedexperiment_biasedexperiment_biasedexperimentvendors_biasedpathways_biasedpathw'),
    ]

    operations = [
        migrations.AddField(
            model_name='ligand',
            name='endogenous',
            field=models.BooleanField(default=False),
        ),
        migrations.AddField(
            model_name='ligandproperities',
            name='sequence',
            field=models.CharField(max_length=1000, null=True),
        ),
        migrations.AlterField(
            model_name='analyzedexperiment',
            name='primary',
            field=models.CharField(max_length=100, null=True),
        ),
        migrations.AlterField(
            model_name='analyzedexperiment',
            name='secondary',
            field=models.CharField(max_length=100, null=True),
        ),
    ]
