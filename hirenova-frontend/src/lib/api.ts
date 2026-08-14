import axios from 'axios';
import Cookies from 'js-cookie';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5001/api';

export const api = axios.create({
    baseURL: API_URL,
});

// Add a request interceptor to attach the JWT token
api.interceptors.request.use((config) => {
    const token = Cookies.get('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Auth API
export const loginUser = (data: any) => api.post('/auth/login', data);
export const registerUser = (data: any) => api.post('/auth/register', data);
export const loginAdmin = (data: any) => api.post('/auth/admin-login', data);
export const getUsers = () => api.get('/auth/users');

// Jobs API
export const getJobs = () => api.get('/jobs');
export const getJobBySlug = (slug: string) => api.get(`/jobs/${slug}`);
export const createJob = (data: any) => api.post('/jobs', data);
export const updateJob = (id: string, data: any) => api.put(`/jobs/${id}`, data);
export const deleteJob = (id: string) => api.delete(`/jobs/${id}`);

// Applications API
export const analyzeProfile = (formData: FormData) => api.post('/applications/analyze', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
});
export const submitApplication = (formData: FormData) => api.post('/applications/submit', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
});
export const getJobApplications = (jobId: string) => api.get(`/applications/job/${jobId}`);
export const rankJobCandidates = (jobId: string) => api.post(`/applications/job/${jobId}/rank`);
export const inviteSelectedCandidates = (jobId: string) => api.post(`/applications/job/${jobId}/invite-selected`);
export const getApplicationById = (appId: string) => api.get(`/applications/${appId}`);
export const sendEmail = (appId: string, data: any) => api.post(`/applications/${appId}/send-email`, data);
export const getMyApplications = () => api.get('/applications/user');
export const inviteCandidate = (appId: string) => api.put(`/applications/${appId}/invite`);
export const submitInterviewAnswer = (appId: string, formData: FormData) => api.post(`/applications/${appId}/answer`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
});

// Written assessments
export const getAssessmentPapers = () => api.get('/assessments/papers');
export const createAssessmentPaper = (data: any) => api.post('/assessments/papers', data);
export const updateAssessmentPaper = (id: string, data: any) => api.put(`/assessments/papers/${id}`, data);
export const publishAssessmentPaper = (id: string) => api.post(`/assessments/papers/${id}/publish`);
export const deleteAssessmentPaper = (id: string) => api.delete(`/assessments/papers/${id}`);
export const getMyAssessment = (applicationId: string) => api.get(`/assessments/application/${applicationId}`);
export const startAssessment = (id: string) => api.post(`/assessments/attempts/${id}/start`);
export const saveAssessmentAnswer = (id: string, questionId: string, data: any) => api.put(`/assessments/attempts/${id}/answers/${questionId}`, data);
export const submitAssessment = (id: string, data: any) => api.post(`/assessments/attempts/${id}/submit`, data);
export const getAssessmentResult = (id: string) => api.get(`/assessments/attempts/${id}/result`);
