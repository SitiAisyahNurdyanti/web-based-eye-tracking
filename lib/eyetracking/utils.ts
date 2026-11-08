// File berisikan fungsi kecil (acak urutan, format waktu)

export const epochNow = () => performance.timeOrigin + performance.now();

export function shuffle<T>(items: readonly T[]) : T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];    
  } 
  return arr; 
}

export function formatSessionTime(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return(
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  )  
}