import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function useDefaultWarehouse() {
  return useQuery({
    queryKey: ['default-warehouse'],
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('id, name').eq('is_default', true).maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}
