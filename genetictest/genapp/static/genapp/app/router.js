export function parseRoute() {
  const raw = (window.location.hash || "").replace(/^#/, "");
  const path = raw.startsWith("/") ? raw : `/${raw}`;
  const parts = path.split("/").filter(Boolean); // remove empty

  // Examples:
  // /dashboard -> ["dashboard"]
  // /doctor/patients -> ["doctor","patients"]
  // /doctor/patients/12 -> ["doctor","patients","12"]
  // /admin/genes -> ["admin","genes"]

  if (parts.length === 0) return { name: "redirect" };

  if (parts[0] === "login") return { name: "login" };
  if (parts[0] === "register") return { name: "register" };

  if (parts[0] === "myth-truth") return { name: "myth-truth" };

  if (parts[0] === "articles") {
    if (parts[1] && !Number.isNaN(Number(parts[1]))) {
      return { name: "article-detail", articleId: Number(parts[1]) };
    }
    return { name: "articles" };
  }

  if (parts[0] === "dashboard") return { name: "dashboard" };
  if (parts[0] === "genotypes") return { name: "genotypes" };
  if (parts[0] === "vitamin-tests") {
    if (parts[1] === "focus" && parts[2] && !Number.isNaN(Number(parts[2]))) {
      return { name: "vitamin-tests", focusTestId: Number(parts[2]) };
    }
    return { name: "vitamin-tests" };
  }
  if (parts[0] === "recommendations") return { name: "recommendations" };
  if (parts[0] === "passport") {
    if (parts[1] === "genotype" && parts[2] && !Number.isNaN(Number(parts[2]))) {
      return { name: "passport", focusGenotypeId: Number(parts[2]) };
    }
    return { name: "passport" };
  }
  if (parts[0] === "patient" && parts[1] === "consultations") {
    return { name: "patient-consultations" };
  }
  // Заявка на очный приём (канонический URL: #/appointments)
  if (parts[0] === "appointments" && parts.length === 1) {
    return { name: "patient-appointments" };
  }
  // Старые ссылки #/patient/appointments
  if (parts[0] === "patient" && parts[1] === "appointments") {
    return { name: "patient-appointments" };
  }
  if (parts[0] === "profile") return { name: "profile" };

  if (parts[0] === "doctor" && parts[1] === "appointments") {
    return { name: "doctor-appointments" };
  }
  if (parts[0] === "doctor" && parts[1] === "patients") {
    if (parts[2]) return { name: "doctor-profile", patientId: Number(parts[2]) };
    return { name: "doctor-patients" };
  }

  if (parts[0] === "admin") {
    if (parts[1] === "genes") return { name: "admin-genes" };
    if (parts[1] === "gene-variants") return { name: "admin-gene-variants" };
    if (parts[1] === "recommendations") return { name: "admin-recommendations" };
  }

  return { name: "not-found", path };
}

