export async function sendDiscordMessage(
  webhookUrl: string,
  content: string,
  fields: { name: string; value: string; inline?: boolean }[],
  color: number,
): Promise<boolean> {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [
          {
            title: content,
            color,
            fields,
            footer: { text: "Undertow, on-chain risk monitor for Robinhood Chain" },
            timestamp: new Date().toISOString(),
          },
        ],
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
