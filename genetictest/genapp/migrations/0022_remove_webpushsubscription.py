from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [
        ("genapp", "0021_merge_recommendation_push_and_gene_symbol"),
    ]

    operations = [
        migrations.DeleteModel(
            name="WebPushSubscription",
        ),
    ]

