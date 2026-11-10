// utils/supabase/client.ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {global:{fetch:async(input,init)=>{
      const url=new URL(input instanceof Request?input.url:String(input));
      const method=(init?.method??(input instanceof Request?input.method:'GET')).toUpperCase();
      if(url.origin===new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).origin&&url.pathname.startsWith('/rest/v1/')&&!['GET','HEAD','OPTIONS'].includes(method)){
        const table=url.pathname.slice('/rest/v1/'.length);
        if(!table.includes('/'))return fetch(`/api/data/${encodeURIComponent(table)}${url.search}`,{method,headers:init?.headers??(input instanceof Request?input.headers:undefined),body:init?.body??(input instanceof Request?await input.clone().text():undefined),signal:init?.signal,credentials:'same-origin'});
      }
      return fetch(input,init);
    }}}
  );
}
