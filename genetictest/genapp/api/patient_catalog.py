from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from genapp.api.permissions import IsPatientNurseOrAdmin
from genapp.models import Gene, GeneVariant, Vitamin


class VitaminChoiceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vitamin
        fields = ["id", "name", "unit_test", "ref_min", "ref_max"]


class GeneChoiceSerializer(serializers.ModelSerializer):
    """Краткая карточка гена для выбора пациентом."""

    class Meta:
        model = Gene
        fields = ["id", "symbol", "full_name", "rs_id", "category"]


class GeneVariantChoiceSerializer(serializers.ModelSerializer):
    gene_symbol = serializers.CharField(source="gene.symbol", read_only=True)
    label = serializers.SerializerMethodField()

    class Meta:
        model = GeneVariant
        fields = ["id", "gene", "gene_symbol", "genotype", "risk_type", "label"]

    def get_label(self, obj):
        sym = getattr(obj.gene, "symbol", "") or ""
        gt = obj.genotype or ""
        return f"{sym} — {gt}".strip(" —")


class PatientVitaminCatalogAPIView(APIView):
    permission_classes = [IsPatientNurseOrAdmin]

    def get(self, request):
        qs = Vitamin.objects.all().order_by("name")
        return Response(VitaminChoiceSerializer(qs, many=True).data)


class PatientGeneCatalogAPIView(APIView):
    permission_classes = [IsPatientNurseOrAdmin]

    def get(self, request):
        qs = Gene.objects.all().order_by("symbol")
        return Response(GeneChoiceSerializer(qs, many=True).data)


class PatientGeneVariantCatalogAPIView(APIView):
    permission_classes = [IsPatientNurseOrAdmin]

    def get(self, request):
        qs = GeneVariant.objects.select_related("gene").order_by("gene__symbol", "genotype")
        gene_id = request.query_params.get("gene")
        if gene_id is not None and str(gene_id).strip() != "":
            qs = qs.filter(gene_id=gene_id)
        return Response(GeneVariantChoiceSerializer(qs, many=True).data)
