'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import Modal from '@/components/ui/Modal';
import {useConfirmation} from '@/components/ui/useConfirmation';
import RegisterPregnantMotherForm from './RegisterPregnantMotherForm';
import type {MaternalRecordData} from '@/utils/maternalRecord';

export default function EditMotherDialog({record,initialIndicatorIds}:{record:MaternalRecordData;initialIndicatorIds:string[]}) {
  const router=useRouter();
  const [dirty,setDirty]=useState(false);
  const [busy,setBusy]=useState(false);
  const closing=useRef(false);
  const {confirm,confirmation}=useConfirmation();
  async function close() {
    if(closing.current||busy)return;
    closing.current=true;
    if(!dirty||await confirm({title:'Discard changes?',description:'Your changes to this maternal record have not been saved.',confirmText:'Discard Changes'})) {
      router.replace('/dashboard/pregnant');router.refresh();
    } else closing.current=false;
  }
  return <><Modal isOpen title="Edit Maternal Record" maxWidth="xl" onClose={()=>void close()}>
    <RegisterPregnantMotherForm initialRecord={record} initialIndicatorIds={initialIndicatorIds} onCancel={()=>void close()} onDirtyChange={setDirty} onBusyChange={setBusy}/>
  </Modal>{confirmation}</>;
}
