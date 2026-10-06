'use client'

import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Raffle } from '@/lib/raffles'

const TERMS: ReactNode[] = [
  <>Al participar en esta rifa organizada por <Brand />, el participante declara haber leido, comprendido y aceptado los siguientes terminos y condiciones:</>,
  <>La participacion en esta rifa es voluntaria y queda confirmada unicamente cuando <Brand /> verifique y apruebe el pago correspondiente.</>,
  <>Cada boleto adquirido representa una oportunidad independiente de ganar. Si un participante adquiere varios boletos, cada uno participara individualmente en el sorteo.</>,
  <>El pago realizado no garantiza la participacion inmediata. Los boletos permaneceran en estado pendiente hasta que la transferencia sea confirmada por <Brand />.</>,
  <>Es responsabilidad del participante proporcionar informacion correcta y veridica, incluyendo nombre completo, numero de telefono y cedula. <Brand /> no sera responsable por errores en los datos suministrados por el participante.</>,
  <>El comprobante de transferencia debe corresponder al monto exacto de la compra. En caso de inconsistencias, la participacion podra quedar pendiente hasta su verificacion o ser rechazada.</>,
  <>El ganador sera seleccionado mediante un sorteo aleatorio utilizando el sistema oficial de rifas de <Brand /> entre todos los boletos activos y confirmados.</>,
  <>El proceso del sorteo podra ser grabado o transmitido con fines de transparencia y confianza para todos los participantes.</>,
  <>El premio sera entregado unicamente al ganador registrado o a la persona debidamente autorizada por este, previa verificacion de identidad mediante documento oficial.</>,
  <><Brand /> podra solicitar la presentacion de la cedula utilizada durante el registro antes de entregar el premio.</>,
  <>Los boletos son personales y permanecen asociados a la cedula utilizada durante el registro. Cualquier cambio de titular debera ser autorizado previamente por <Brand />.</>,
  <>Una vez confirmado el pago, los boletos no son reembolsables, salvo que la rifa sea cancelada por decision exclusiva de <Brand />.</>,
  <>En caso de cancelacion de la rifa, <Brand /> informara el procedimiento correspondiente para la devolucion de los pagos realizados o la reprogramacion del sorteo.</>,
  <><Brand /> se reserva el derecho de rechazar solicitudes con informacion falsa, comprobantes alterados, pagos no verificados o cualquier intento de fraude.</>,
  <>Los datos personales suministrados seran utilizados unicamente para la administracion de la rifa, la identificacion del ganador y las comunicaciones relacionadas con la misma. No seran compartidos con terceros sin autorizacion, salvo cuando sea requerido por la ley.</>,
  <>La fecha del sorteo podra modificarse por causas de fuerza mayor, problemas tecnicos o circunstancias excepcionales. Cualquier cambio sera informado a traves de los canales oficiales de <Brand />.</>,
  <>Al aceptar estos terminos, el participante autoriza a <Brand /> a publicar su nombre y el numero de boleto ganador en caso de resultar ganador, con fines de transparencia y promocion de futuras rifas.</>,
  <>La participacion en la rifa implica la aceptacion total de estos terminos y condiciones.</>,
]

export default function RaffleTermsPage() {
  const params = useParams<{ id?: string; slug?: string }>()
  const key = String(params.id || params.slug || '')
  const [raffle, setRaffle] = useState<Raffle | null>(null)

  const loadData = useCallback(async () => {
    let result = await supabase.from('raffles').select('id, slug').eq('slug', key).maybeSingle()
    if (!result.data) result = await supabase.from('raffles').select('id, slug').eq('id', key).maybeSingle()
    setRaffle((result.data || null) as Raffle | null)
  }, [key])

  useEffect(() => { void loadData() }, [loadData])

  return <main className="min-h-screen bg-white px-7 py-8 text-zinc-950 sm:px-14 print:px-0 print:py-0">
    <style>{`@page { size: A4; margin: 9mm; } @media print { body { background: white !important; } .no-print { display: none !important; } .terms-sheet { max-width: none !important; } .terms-logo { height: 54px !important; width: 54px !important; } .terms-title { margin-top: 4px !important; font-size: 20px !important; line-height: 1.05 !important; } .terms-list { margin-top: 12px !important; font-size: 10.9px !important; line-height: 1.24 !important; gap: 0 !important; } .terms-list li { margin-top: 7px !important; padding-left: 5px !important; } }`}</style>
    <section className="terms-sheet mx-auto max-w-4xl">
      <div className="flex items-start justify-between gap-6">
        <div className="no-print flex items-center gap-3"><a href={raffle?.slug ? `/${raffle.slug}` : 'javascript:history.back()'} className="inline-flex items-center gap-2 text-2xl font-black uppercase text-black">
          <span className="text-5xl leading-none">&larr;</span> Volver
        </a><button onClick={() => window.print()} className="rounded-xl bg-emerald-700 px-4 py-3 text-base font-black text-white">Imprimir normas</button></div>
        <img src="/logo-guatapo-transparent.png" alt="Guatapo" className="terms-logo h-28 w-28 object-contain sm:h-36 sm:w-36" />
      </div>
      <h1 className="terms-title mt-4 text-3xl font-black uppercase leading-tight text-emerald-700 sm:text-4xl">Terminos y condiciones de la rifa</h1>
      <ul className="terms-list mt-7 space-y-7 pl-6 text-xl leading-relaxed sm:text-2xl">
        {TERMS.map((term, index) => <li key={index} className="list-disc pl-3">{term}</li>)}
      </ul>
    </section>
  </main>
}

function Brand() {
  return <strong className="font-black text-emerald-700">GUATAPO</strong>
}
