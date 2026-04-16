import { getBasicAuthHeaderValue } from "./auth.js";

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
    throw new Error(message);
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
    register: ({ username, email, first_name, last_name, password1, password2 }) =>
      request("post", "/api/auth/register/", {
        data: { username, email, first_name, last_name, password1, password2 },
      }),
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

