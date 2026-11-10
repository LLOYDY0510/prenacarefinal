'use client';
import { useRouter } from 'next/navigation';
import Modal from '@/components/ui/Modal';
export default function RecordRouteModal({children}: {children:React.ReactNode}) {
  const router=useRouter();
  return <Modal isOpen title="Record Details" maxWidth="xl" onClose={()=>router.back()}>{children}</Modal>;
}
