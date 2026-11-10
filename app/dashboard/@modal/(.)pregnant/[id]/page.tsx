import RecordRouteModal from '@/components/pregnant/RecordRouteModal';
import ViewPregnantMotherPage from '@/app/dashboard/pregnant/[id]/page';
export default async function RecordModal(props:Parameters<typeof ViewPregnantMotherPage>[0]) {
  const {view}=await props.searchParams;
  if(view==='edit')return <ViewPregnantMotherPage {...props}/>;
  return <RecordRouteModal><ViewPregnantMotherPage {...props}/></RecordRouteModal>;
}
