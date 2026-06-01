'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users, Plus, Power } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/format';
import { AddEmployeeDialog } from '@/components/employees/AddEmployeeDialog';
import { useAuth } from '@/stores/auth.store';

const ROLE_VARIANT: Record<string, any> = {
  OWNER: 'accent',
  ADMIN: 'default',
  CASHIER: 'success',
  KITCHEN: 'warning',
};

const ROLE_LABEL: Record<string, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  CASHIER: 'Cashier',
  KITCHEN: 'Kitchen',
};

export default function EmployeesPage() {
  const qc = useQueryClient();
  const { user: me } = useAuth();
  const [addOpen, setAddOpen] = useState(false);

  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees'],
    queryFn: () => api.get('/employees').then((r) => r.data),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/employees/${id}`, { isActive }).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['employees'] });
      toast.success('Status updated');
    },
    onError: (e: any) => toast.error(e.response?.data?.error || 'Update failed'),
  });

  return (
    <div className="p-4 sm:p-6 h-full overflow-y-auto scrollbar-thin">
      <div className="flex items-center justify-between mb-4 gap-2">
        <h2 className="text-lg sm:text-xl font-bold">Staff ({employees.length})</h2>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="w-4 h-4 mr-1" /> Add staff
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="shimmer h-16 rounded-xl" />
          ))}
        </div>
      ) : employees.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <Users className="w-12 h-12 mb-3 opacity-30" />
          <p className="mb-3">No staff yet</p>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Add first staff member
          </Button>
        </div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block bg-card rounded-2xl border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted text-left">
                <tr>
                  <th className="p-3">Name</th>
                  <th className="p-3">Email</th>
                  <th className="p-3">Role</th>
                  <th className="p-3 text-right">Orders</th>
                  <th className="p-3">Status</th>
                  <th className="p-3">Joined</th>
                  <th className="p-3 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {employees.map((u: any) => (
                  <tr key={u.id} className="border-t border-border hover:bg-card-hover">
                    <td className="p-3 font-medium">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs">
                          {u.name[0]}
                        </div>
                        <span>
                          {u.name}
                          {u.id === me?.id && (
                            <span className="text-xs text-muted-foreground ml-1">(you)</span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">{u.email}</td>
                    <td className="p-3">
                      <Badge variant={ROLE_VARIANT[u.role]}>{ROLE_LABEL[u.role] || u.role}</Badge>
                    </td>
                    <td className="p-3 text-right tabular-nums">{u._count?.orders || 0}</td>
                    <td className="p-3">
                      {u.isActive ? (
                        <Badge variant="success">Active</Badge>
                      ) : (
                        <Badge variant="danger">Inactive</Badge>
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs">{formatDate(u.createdAt)}</td>
                    <td className="p-3">
                      {u.id !== me?.id && u.role !== 'OWNER' && (
                        <button
                          onClick={() => toggleActive.mutate({ id: u.id, isActive: !u.isActive })}
                          className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                          title={u.isActive ? 'Deactivate' : 'Activate'}
                        >
                          <Power className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {employees.map((u: any) => (
              <div key={u.id} className="bg-card border border-border rounded-xl p-3">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-sm font-bold shrink-0">
                    {u.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {u.name}
                      {u.id === me?.id && (
                        <span className="text-xs text-muted-foreground ml-1">(you)</span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground truncate">{u.email}</div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      <Badge variant={ROLE_VARIANT[u.role]} className="text-[10px]">
                        {ROLE_LABEL[u.role] || u.role}
                      </Badge>
                      {u.isActive ? (
                        <Badge variant="success" className="text-[10px]">Active</Badge>
                      ) : (
                        <Badge variant="danger" className="text-[10px]">Inactive</Badge>
                      )}
                      <Badge variant="default" className="text-[10px]">
                        {u._count?.orders || 0} orders
                      </Badge>
                    </div>
                  </div>
                  {u.id !== me?.id && u.role !== 'OWNER' && (
                    <button
                      onClick={() => toggleActive.mutate({ id: u.id, isActive: !u.isActive })}
                      className="p-2 rounded hover:bg-muted text-muted-foreground"
                    >
                      <Power className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <AddEmployeeDialog open={addOpen} onClose={() => setAddOpen(false)} />
    </div>
  );
}
