// Cached interest forms must never be treated as complete bookings.
module.exports = (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  return response.status(410).json({
    ok: false,
    message: 'Je kunt nu definitief boeken. Herlaad de taxipagina en vul het boekingsformulier in, inclusief je adres en gewenste ritten.',
  });
};
