import { ref } from 'vue';

/** Is the guided tour showing? Offered automatically once per browser (takui:toured). */
export const tourActive = ref(shouldOffer());

function shouldOffer(): boolean {
  try { return !localStorage.getItem('takui:toured'); } catch { return false; }
}
