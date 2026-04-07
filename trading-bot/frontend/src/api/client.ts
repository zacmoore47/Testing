import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

export const Api = {
  health: () => api.get('/health').then(r => r.data),
  research: {
    run: () => api.post('/research/run').then(r => r.data),
    signals: () => api.get('/research/signals').then(r => r.data),
  },
  filter: {
    run: () => api.post('/filter/run').then(r => r.data),
    results: () => api.get('/filter/results').then(r => r.data),
  },
  predict: {
    run: () => api.post('/predict/run').then(r => r.data),
    results: () => api.get('/predict/results').then(r => r.data),
  },
  alerts: {
    latest: () => api.get('/alerts/latest').then(r => r.data),
    history: () => api.get('/alerts/history').then(r => r.data),
  },
  learn: {
    stats: () => api.get('/learn/stats').then(r => r.data),
    outcomes: () => api.get('/learn/outcomes').then(r => r.data),
    submit: (o: any) => api.post('/learn/outcome', o).then(r => r.data),
  },
};
