const firstNames = ["James", "Mary", "John", "Patricia", "Robert", "Jennifer", "Michael", "Linda", "David", "Elizabeth", "William", "Barbara", "Richard", "Susan", "Joseph", "Jessica", "Thomas", "Sarah", "Charles", "Karen", "Daniel", "Nancy", "Matthew", "Emma", "Andrew"];
const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Wilson", "Anderson", "Taylor", "Thomas", "Moore", "Martin", "Jackson", "Thompson", "White", "Lopez", "Lee", "Harris", "Clark", "Lewis", "Robinson", "Walker", "Hall"];

function formatUsername(first: string, last: string): string {
  const clean = (name: string) => name.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 25);
  const given = clean(first);
  const family = clean(last);
  if (!given || !family) throw new Error("Invalid name");
  return `${given}.${family}${Math.floor(Math.random() * 90) + 10}`;
}

export function fallbackUsername(): string {
  return formatUsername(firstNames[Math.floor(Math.random() * firstNames.length)], lastNames[Math.floor(Math.random() * lastNames.length)]);
}

export async function fetchRealisticUsername(): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);
  try {
    const response = await fetch("https://randomuser.me/api/?nat=us,gb,ca,au&inc=name", { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error("Name service unavailable");
    const data: unknown = await response.json();
    const name = (data as { results?: { name?: { first?: unknown; last?: unknown } }[] } | null)?.results?.[0]?.name;
    if (typeof name?.first !== "string" || typeof name.last !== "string") throw new Error("Invalid name response");
    return formatUsername(name.first, name.last);
  } catch {
    return fallbackUsername();
  } finally {
    clearTimeout(timeout);
  }
}
