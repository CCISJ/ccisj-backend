function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };

    return entities[char];
  });
}

export function emergencyNotificationTemplate(
  titulo: string,
  mensaje: string,
) {
  return {
    subject: `CCISJ - ${titulo}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
        <h2 style="color: #b91c1c;">Notificación urgente - CCISJ</h2>

        <h3>${escapeHtml(titulo)}</h3>

        <p style="white-space: pre-wrap;">${escapeHtml(mensaje)}</p>

        <hr />

        <p style="font-size: 12px; color: #666;">
          Este es un mensaje automático del Centro Comercial e Industrial de San José.
        </p>
      </div>
    `,
  };
}