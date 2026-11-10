'use client';
import {useRef,useState} from 'react';
import {useRouter} from 'next/navigation';
import Modal from '@/components/ui/Modal';
import {useConfirmation} from '@/components/ui/useConfirmation';
import RegisterPregnantMotherForm from './RegisterPregnantMotherForm';

export default function RegisterMotherDialog(){
  const router=useRouter();const [dirty,setDirty]=useState(false);const closing=useRef(false);
  const [busy,setBusy]=useState(false);
  const {confirm,confirmation}=useConfirmation();
  async function close(){
    if(closing.current||busy)return;
    closing.current=true;
    if(!dirty||await confirm({title:'Discard registration?',description:'The patient information you entered has not been saved.',confirmText:'Discard Changes'})){
      router.replace('/dashboard/pregnant');router.refresh();
    }else closing.current=false;
  }
  return <><Modal isOpen title="Register Pregnant Woman" maxWidth="xl" onClose={()=>void close()}>
    <RegisterPregnantMotherForm onCancel={()=>void close()} onDirtyChange={setDirty} onBusyChange={setBusy}/>
  </Modal>{confirmation}</>;
}
