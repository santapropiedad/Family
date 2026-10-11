import IntegranteClient from "@/components/IntegranteClient";

// Página totalmente dinámica (depende del :id en la URL y de datos cargados en el cliente);
// no tiene sentido intentar pre-renderizarla como contenido estático.
export const instant = false;

export default async function IntegrantePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <IntegranteClient memberId={id} />;
}
