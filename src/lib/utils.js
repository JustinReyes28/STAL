// Placeholder for helper utilities
export const formatTime = (ms) => {
  const sec = Math.floor(ms / 1000);
  const min = Math.floor(sec / 60);
  const hr = Math.floor(min / 60);
  return `${hr}h ${min % 60}m ${sec % 60}s`;
};
