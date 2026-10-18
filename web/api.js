export async function request(path, options = {}) {
  const response = await fetch(path, options);
  if (!response.ok) throw new Error(await response.text());
  return response;
}

export async function json(path, body, signal) {
  const response = await request(path, {
    method: "POST",
    signal,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return response.json();
}

export function message(output, text = "") {
  output.textContent = text;
  output.hidden = !text;
}
