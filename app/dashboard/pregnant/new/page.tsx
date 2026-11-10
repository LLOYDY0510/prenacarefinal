import { requireRoles } from '@/utils/auth/roles';
import RegisterMotherDialog from '@/components/pregnant/RegisterMotherDialog';
export default async function RegisterPregnantMotherPage(){await requireRoles(['bhw']);return <RegisterMotherDialog/>;}
