export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const update = req.body;
  console.log("Telegram update:", update);

  res.status(200).json({ ok: true });
}
