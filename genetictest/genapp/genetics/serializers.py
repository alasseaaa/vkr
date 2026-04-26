from django.db.models import Q
from rest_framework import serializers

from genapp.models import Gene, GeneVariant, UserGenotype


class UserGenotypeSerializer(serializers.ModelSerializer):
    gene_symbol = serializers.SerializerMethodField()
    gene = serializers.IntegerField(source="gene_variant.gene_id", read_only=True)
    gene_full_name = serializers.CharField(source="gene_variant.gene.full_name", read_only=True)
    gene_description = serializers.CharField(source="gene_variant.gene.description", read_only=True)
    gene_effect_description = serializers.CharField(source="gene_variant.gene.effect_description", read_only=True)
    variant_genotype = serializers.CharField(source="gene_variant.genotype", read_only=True)
    variant_description = serializers.CharField(source="gene_variant.variant_description", read_only=True)
    risk_type = serializers.CharField(source="gene_variant.risk_type", read_only=True)

    class Meta:
        model = UserGenotype
        fields = [
            "id",
            "gene",
            "gene_variant",
            "gene_symbol",
            "gene_full_name",
            "gene_description",
            "gene_effect_description",
            "variant_genotype",
            "variant_description",
            "risk_type",
            "created_at",
            "updated_at",
        ]
        read_only_fields = [
            "id",
            "gene",
            "created_at",
            "updated_at",
            "gene_symbol",
            "gene_full_name",
            "gene_description",
            "gene_effect_description",
            "variant_genotype",
            "variant_description",
            "risk_type",
        ]

    def get_gene_symbol(self, obj):
        return getattr(obj.gene_variant.gene, "symbol", None)

    def validate(self, attrs):
        request = self.context.get("request")
        user = None
        if request and getattr(request, "user", None) and request.user.is_authenticated:
            user = self.context.get("genotype_user") or request.user
        if not user:
            return attrs

        gene_variant = attrs.get("gene_variant")
        if not gene_variant:
            return attrs

        qs = UserGenotype.objects.filter(user=user, gene_variant=gene_variant)
        if self.instance is not None:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError("Этот вариант генотипа уже добавлен пользователем.")

        gene_id = gene_variant.gene_id
        qs_same_gene = UserGenotype.objects.filter(user=user, gene_variant__gene_id=gene_id)
        if self.instance is not None:
            qs_same_gene = qs_same_gene.exclude(pk=self.instance.pk)
        if qs_same_gene.exists():
            raise serializers.ValidationError(
                "Для этого гена у вас уже указан генотип. Измените существующую запись или удалите её."
            )

        return attrs


class GeneSerializer(serializers.ModelSerializer):
    class Meta:
        model = Gene
        fields = ["id", "symbol", "full_name", "description", "category", "rs_id", "effect_description"]


class GeneVariantSerializer(serializers.ModelSerializer):
    gene_symbol = serializers.SerializerMethodField(read_only=True)

    class Meta:
        model = GeneVariant
        fields = ["id", "gene", "gene_symbol", "genotype", "risk_type", "variant_description"]
        read_only_fields = ["id", "gene_symbol"]

    def get_gene_symbol(self, obj):
        return getattr(obj.gene, "symbol", None)

