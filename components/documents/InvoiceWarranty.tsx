const warrantyLines = [
  'Todos nuestros equipos electronicos, tales como:',
  'Celulares, laptops, tablets, monitores, CPU,',
  'impresoras, consolas de videojuegos,',
  'cuentan con garantia segun las siguientes',
  'condiciones:',
]

export default function InvoiceWarranty() {
  return (
    <section className="receipt-warranty mt-6 break-inside-avoid text-[11px] leading-tight text-black">
      <h2 className="text-[13px] font-bold">Normas Garantia</h2>
      <div className="mt-1">
        {warrantyLines.map((line) => <p key={line}>{line}</p>)}
      </div>
      <ul className="mt-1 list-disc pl-4">
        <li>Equipos usados: <strong>30 dias</strong> de garantia.</li>
        <li>Equipos nuevos: <strong>3 meses</strong> de garantia.</li>
        <li>Perifericos, relojes inteligentes, adaptadores y accesorios: <strong>48 horas</strong> de garantia.</li>
      </ul>
      <p className="mt-1">La garantia <strong>NO</strong> cubre:</p>
      <ul className="list-disc pl-4">
        <li>Danos fisicos ocasionados por caidas, golpes, contacto con agua o arena.</li>
        <li>Danos OCACIONADOS en el sistema operativo o software del equipo.</li>
        <li>NO Devolucion de dinero.</li>
      </ul>
    </section>
  )
}
