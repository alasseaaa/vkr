import { getBasicAuthHeaderValue } from "./auth.js?v=3";

const axiosInstance = axios.create({
  baseURL: "",
  headers: {
    "Content-Type": "application/json",
  },
});

axiosInstance.interceptors.request.use((config) => {
  const authHeader = getBasicAuthHeaderValue();
  if (authHeader) {
    config.headers.Authorization = authHeader;
  }

  // Фолбэк: если backend всё же потребует CSRF, отправим cookie-токен.
  const csrf = getCookie("csrftoken");
  if (csrf) {
    config.headers["X-CSRFToken"] = csrf;
  }

  return config;
});

function normalizeError(error) {
  if (error?.response?.data?.detail) return error.response.data.detail;
  if (error?.response?.data) return JSON.stringify(error.response.data);
  return error?.message || "Ошибка сети";
}

export async function request(method, url, { data, params } = {}) {
  try {
    const res = await axiosInstance.request({ method, url, data, params });
    return res.data;
  } catch (e) {
    const message = normalizeError(e);
    const err = new Error(message);
    if (e?.response?.status) {
      err.status = e.response.status;
    }
    throw err;
  }
}

/**
 * Multipart-загрузка PDF: axios с дефолтом JSON ломает boundary, поэтому fetch.
 * @param {File} file
 * @param {string} [uploadUrl] по умолчанию /api/patient/genetic-reports/
 */
export async function uploadFilePost(url, file, { fieldName = "file" } = {}) {
  const form = new FormData();
  form.append(fieldName, file);
  const headers = {};
  const auth = getBasicAuthHeaderValue();
  if (auth) headers.Authorization = auth;
  const csrf = getCookie("csrftoken");
  if (csrf) headers["X-CSRFToken"] = csrf;
  const r = await fetch(url, { method: "POST", body: form, headers, credentials: "same-origin" });
  const text = await r.text();
  if (!r.ok) {
    let msg = text;
    try {
      const j = JSON.parse(text);
      msg = j.detail || (Array.isArray(j.file) ? j.file[0] : j.file) || j.message || text;
    } catch {
      /* as text */
    }
    throw new Error(typeof msg === "string" ? msg : "Ошибка загрузки");
  }
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { ok: true };
  }
}

/**
 * Скачивание бинарного ответа (PDF и т.п.).
 * @returns {{ blob: Blob, filename: string }}
 */
export async function requestBlob(method, url, { params } = {}) {
  try {
    const res = await axiosInstance.request({
      method,
      url,
      params,
      responseType: "blob",
    });
    const dispo = res.headers["content-disposition"] || "";
    let filename = "download.pdf";
    const m = /filename="([^"]+)"/.exec(dispo);
    if (m) {
      filename = m[1].trim();
    }
    return { blob: res.data, filename };
  } catch (e) {
    if (e.response?.data instanceof Blob) {
      const t = await e.response.data.text();
      let msg = t;
      try {
        const j = JSON.parse(t);
        msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j);
      } catch {
        /* текст как есть */
      }
      throw new Error(msg);
    }
    throw new Error(normalizeError(e));
  }
}

export const api = {
  /** Комментарии врача (чтение): GET /api/v1/comments/ */
  comments: {
    list: (params) => request("get", "/api/v1/comments/", { params: params || {} }),
  },
  /** Публичные эндпоинты (без обязательной авторизации) */
  public: {
    listArticles: (params) => request("get", "/api/articles/", { params: params || {} }),
    getArticle: (id) => request("get", `/api/articles/${id}/`),
    listMythTruthQuestions: () => request("get", "/api/myth-truth/questions/"),
    submitMythTruth: (data) => request("post", "/api/myth-truth/submit/", { data }),
  },
  auth: {
    login: ({ email, password }) =>
      request("post", "/api/auth/login/", { data: { email, password } }),
    /** Текущий пользователь и роль (сервер) — обновить localStorage. */
    me: () => request("get", "/api/auth/me/"),
    /** См. RegisterSerializer: обязательны в т.ч. consent_personal_data, without_genetic_test. */
    register: (data) => request("post", "/api/auth/register/", { data }),
  },
  patient: {
    getProfile: () => request("get", "/api/patient/profile/"),
    updateProfile: (payload) => request("patch", "/api/patient/profile/", { data: payload }),

    listGenotypes: () => request("get", "/api/patient/genotypes/"),
    createGenotype: (payload) => request("post", "/api/patient/genotypes/", { data: payload }),
    updateGenotype: (id, payload) =>
      request("put", `/api/patient/genotypes/${id}/`, { data: payload }),
    deleteGenotype: (id) => request("delete", `/api/patient/genotypes/${id}/`),

    listVitaminTests: () => request("get", "/api/patient/vitamin-tests/"),
    createVitaminTest: (payload) =>
      request("post", "/api/patient/vitamin-tests/", { data: payload }),
    updateVitaminTest: (id, payload) =>
      request("put", `/api/patient/vitamin-tests/${id}/`, { data: payload }),
    deleteVitaminTest: (id) => request("delete", `/api/patient/vitamin-tests/${id}/`),

    getInterpretation: () => request("get", "/api/patient/interpretation/"),
    getRecommendations: () => request("get", "/api/patient/recommendations/"),

    async downloadReportPdf() {
      const { blob, filename } = await requestBlob("get", "/api/patient/report/pdf/");
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "otchet.pdf";
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },

    getUnreadNotifications: () => request("get", "/api/patient/notifications/unread/"),
    markNotificationsRead: (ids) =>
      request("post", "/api/patient/notifications/mark-read/", { data: { ids } }),

    listVitaminCatalog: () => request("get", "/api/patient/vitamins/catalog/"),
    listGeneCatalog: () => request("get", "/api/patient/genes/catalog/"),
    listGeneVariantCatalog: (params) =>
      request("get", "/api/patient/gene-variants/catalog/", { params }),

    listGeneticReports: () => request("get", "/api/patient/genetic-reports/"),
    async uploadGeneticReportPdf(file) {
      return uploadFilePost("/api/patient/genetic-reports/", file, { fieldName: "file" });
    },
    /** Просмотр PDF в новой вкладке (только с авторизацией, не публичный /media/). */
    async openGeneticReportPdfInNewTab(id) {
      const url = `/api/patient/genetic-reports/${id}/file/`;
      const headers = {};
      const a = getBasicAuthHeaderValue();
      if (a) headers.Authorization = a;
      const r = await fetch(url, { method: "GET", headers, credentials: "same-origin" });
      if (!r.ok) {
        const t = await r.text();
        let msg = t;
        try {
          const j = JSON.parse(t);
          msg = typeof j.detail === "string" ? j.detail : t;
        } catch {
          /* as text */
        }
        throw new Error(typeof msg === "string" ? msg : "Не удалось открыть PDF");
      }
      const blob = await r.blob();
      const burl = window.URL.createObjectURL(blob);
      const w = window.open(burl, "_blank", "noopener");
      if (!w) {
        window.URL.revokeObjectURL(burl);
        throw new Error("Включите всплывающие окна для просмотра PDF или скачайте файл вручную.");
      }
      window.setTimeout(() => {
        try {
          window.URL.revokeObjectURL(burl);
        } catch {
          /* */
        }
      }, 600_000);
    },
    deleteGeneticReport: (id) => request("delete", `/api/patient/genetic-reports/${id}/`),

    listLinkedDoctors: () => request("get", "/api/patient/doctors/"),
    listAppointments: () => request("get", "/api/patient/appointments/"),
    createAppointment: (payload) => request("post", "/api/patient/appointments/", { data: payload }),
    cancelAppointment: (id) =>
      request("patch", `/api/patient/appointments/${id}/`, { data: { cancel: true } }),
  },
  doctor: {
    listPatients: (params) => request("get", "/api/doctor/patients/", { params: params || {} }),
    getActivityFeed: (params) => request("get", "/api/doctor/activity/", { params: params || {} }),
    listAppointments: (params) => request("get", "/api/doctor/appointments/", { params: params || {} }),
    updateAppointment: (id, payload) =>
      request("patch", `/api/doctor/appointments/${id}/`, { data: payload }),
    getProfile: (patientId) => request("get", `/api/doctor/patients/${patientId}/profile/`),
    createComment: (patientId, payload) =>
      request("post", `/api/doctor/patients/${patientId}/comments/`, { data: payload }),
    updateComment: (commentId, payload) =>
      request("put", `/api/doctor/comments/${commentId}/`, { data: payload }),
    createConclusion: (patientId, payload) =>
      request("post", `/api/doctor/patients/${patientId}/conclusion/`, { data: payload }),
  },
  nurse: {
    listGeneticReports: (params) =>
      request("get", "/api/nurse/genetic-reports/", { params: params || {} }),
    getGeneticReport: (uploadId) => request("get", `/api/nurse/genetic-reports/${uploadId}/`),
    patchGeneticReport: (uploadId, payload) =>
      request("patch", `/api/nurse/genetic-reports/${uploadId}/`, { data: payload }),
    getUnreadNurseUploadNotifications: () => request("get", "/api/nurse/notifications/unread/"),
    markNurseNotificationsRead: (ids) =>
      request("post", "/api/nurse/notifications/mark-read/", { data: { ids } }),
    getPatientSummary: (patientId) => request("get", `/api/nurse/patients/${patientId}/`),

    listPatientGenotypes: (patientId) => request("get", `/api/nurse/patients/${patientId}/genotypes/`),
    createPatientGenotype: (patientId, payload) =>
      request("post", `/api/nurse/patients/${patientId}/genotypes/`, { data: payload }),
    updatePatientGenotype: (patientId, id, payload) =>
      request("patch", `/api/nurse/patients/${patientId}/genotypes/${id}/`, { data: payload }),
    deletePatientGenotype: (patientId, id) =>
      request("delete", `/api/nurse/patients/${patientId}/genotypes/${id}/`),
  },
  admin: {
    // genes
    listGenes: () => request("get", "/api/admin/genes/"),
    createGene: (payload) => request("post", "/api/admin/genes/", { data: payload }),
    updateGene: (id, payload) => request("put", `/api/admin/genes/${id}/`, { data: payload }),
    deleteGene: (id) => request("delete", `/api/admin/genes/${id}/`),

    // gene variants
    listGeneVariants: () => request("get", "/api/admin/gene-variants/"),
    createGeneVariant: (payload) =>
      request("post", "/api/admin/gene-variants/", { data: payload }),
    updateGeneVariant: (id, payload) =>
      request("put", `/api/admin/gene-variants/${id}/`, { data: payload }),
    deleteGeneVariant: (id) => request("delete", `/api/admin/gene-variants/${id}/`),

    // recommendations
    listRecommendations: () => request("get", "/api/admin/recommendations/"),
    createRecommendation: (payload) =>
      request("post", "/api/admin/recommendations/", { data: payload }),
    updateRecommendation: (id, payload) =>
      request("put", `/api/admin/recommendations/${id}/`, { data: payload }),
    deleteRecommendation: (id) => request("delete", `/api/admin/recommendations/${id}/`),
  },
};

export { normalizeError };

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(";").shift();
  return null;
}

