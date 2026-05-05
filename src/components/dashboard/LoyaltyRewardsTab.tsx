import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { Plus, Trash2, Pencil, Gift, Search, ArrowLeft, ArrowRight, Check, Bike, Store, ShoppingBag, History } from "lucide-react";
import { brl, formatPhone } from "@/lib/format";
import { DeliveryZone, GeoPoint, findDeliveryFee, geocodeAddress, haversineKm } from "@/lib/delivery";
import { ordersKey } from "./OrdersPanel";

const sb = supabase as any;

type Reward = {
  id: string;
  restaurant_id: string;
  product_id: string | null;
  name: string;
  points_cost: number;
  stock: number | null;
  is_active: boolean;
};

type Member = { id: string; name: string; phone: string; points: number };

interface OptionItem { id: string; name: string; extra_price: number; }
interface OptGroup { id: string; name: string; min_select: number; max_select: number; items: OptionItem[]; }

type OrderMode = "pdv" | "pickup" | "delivery";
type PaymentMethod = "cash" | "pix" | "card_on_delivery";

async function fetchProductOptionGroups(restaurantId: string, productId: string): Promise<OptGroup[]> {
  const [linksRes, groupsRes, itemsRes] = await Promise.all([
    supabase.from("product_option_groups").select("group_id, sort_order").eq("product_id", productId),
    supabase.from("option_groups").select("id, name, min_select, max_select, sort_order, is_active, restaurant_id").eq("restaurant_id", restaurantId).eq("is_active", true),
    supabase.from("option_items").select("id, group_id, name, extra_price, is_active, sort_order, option_groups!inner(restaurant_id)").eq("option_groups.restaurant_id", restaurantId).eq("is_active", true).order("sort_order"),
  ]);
  const groupById = new Map<string, any>(((groupsRes.data ?? []) as any[]).map((g) => [g.id, g]));
  const itemsByGroup = new Map<string, OptionItem[]>();
  ((itemsRes.data ?? []) as any[]).forEach((it) => {
    const arr = itemsByGroup.get(it.group_id) ?? [];
    arr.push({ id: it.id, name: it.name, extra_price: Number(it.extra_price) });
    itemsByGroup.set(it.group_id, arr);
  });
  const out: { g: OptGroup; sort: number }[] = [];
  ((linksRes.data ?? []) as any[]).forEach((l) => {
    const g = groupById.get(l.group_id);
    if (!g) return;
    out.push({
      g: { id: g.id, name: g.name, min_select: g.min_select, max_select: g.max_select, items: itemsByGroup.get(g.id) ?? [] },
      sort: l.sort_order ?? 0,
    });
  });
  return out.sort((a, b) => a.sort - b.sort).map((x) => x.g);
}

export function LoyaltyRewardsTab({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();

  const productsQ = useQuery({
    queryKey: ["loyalty-products-list", restaurantId],
    queryFn: async () => {
      const { data } = await sb.from("products").select("id, name, price").eq("restaurant_id", restaurantId).eq("is_active", true).order("name");
      return (data ?? []) as { id: string; name: string; price: number }[];
    },
  });

  const rewardsQ = useQuery({
    queryKey: ["loyalty-rewards", restaurantId],
    queryFn: async (): Promise<Reward[]> => {
      const { data } = await sb.from("loyalty_rewards").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const membersQ = useQuery({
    queryKey: ["loyalty-members", restaurantId],
    queryFn: async (): Promise<Member[]> => {
      const { data } = await sb.from("loyalty_members").select("id, name, phone, points").eq("restaurant_id", restaurantId).order("name");
      return data ?? [];
    },
  });

  // Reward dialog (create/edit)
  const [dlg, setDlg] = useState(false);
  const [editing, setEditing] = useState<Reward | null>(null);
  const [productId, setProductId] = useState<string>("none");
  const [name, setName] = useState("");
  const [cost, setCost] = useState("100");
  const [stock, setStock] = useState("");
  const [active, setActive] = useState(true);

  const openCreate = () => {
    setEditing(null);
    setProductId("none"); setName(""); setCost("100"); setStock(""); setActive(true);
    setDlg(true);
  };
  const openEdit = (r: Reward) => {
    setEditing(r);
    setProductId(r.product_id ?? "none");
    setName(r.name);
    setCost(String(r.points_cost));
    setStock(r.stock == null ? "" : String(r.stock));
    setActive(r.is_active);
    setDlg(true);
  };

  const save = async () => {
    if (!name.trim()) return toast.error("Informe o nome");
    const payload = {
      restaurant_id: restaurantId,
      product_id: productId === "none" ? null : productId,
      name: name.trim(),
      points_cost: Math.max(0, Math.floor(Number(cost) || 0)),
      stock: stock === "" ? null : Math.max(0, Math.floor(Number(stock) || 0)),
      is_active: active,
    };
    const { error } = editing
      ? await sb.from("loyalty_rewards").update(payload).eq("id", editing.id)
      : await sb.from("loyalty_rewards").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Salvo");
    setDlg(false);
    qc.invalidateQueries({ queryKey: ["loyalty-rewards", restaurantId] });
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta recompensa?")) return;
    const { error } = await sb.from("loyalty_rewards").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["loyalty-rewards", restaurantId] });
  };

  // ============== REDEEM WIZARD ==============
  const [redeemReward, setRedeemReward] = useState<Reward | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  return (
    <div className="space-y-4 pt-4">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <div className="text-sm text-muted-foreground">Cadastre produtos do cardápio que podem ser resgatados com pontos</div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setHistoryOpen(true)}><History className="w-4 h-4 mr-1" />Histórico de resgate</Button>
          <Button onClick={openCreate}><Plus className="w-4 h-4 mr-1" />Nova recompensa</Button>
        </div>
      </div>

      <div className="border rounded-lg">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Recompensa</TableHead>
              <TableHead>Produto vinculado</TableHead>
              <TableHead className="text-right">Pontos</TableHead>
              <TableHead className="text-right">Estoque</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right w-56">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(rewardsQ.data ?? []).map((r) => {
              const prod = productsQ.data?.find((p) => p.id === r.product_id);
              return (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{prod?.name ?? "—"}</TableCell>
                  <TableCell className="text-right font-bold">{r.points_cost}</TableCell>
                  <TableCell className="text-right">{r.stock == null ? "∞" : r.stock}</TableCell>
                  <TableCell><Badge variant={r.is_active ? "default" : "secondary"}>{r.is_active ? "Ativa" : "Inativa"}</Badge></TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" onClick={() => setRedeemReward(r)} disabled={!r.is_active}><Gift className="w-4 h-4 mr-1" />Resgatar</Button>
                      <Button variant="ghost" size="icon" onClick={() => openEdit(r)}><Pencil className="w-4 h-4" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => remove(r.id)}><Trash2 className="w-4 h-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
            {(rewardsQ.data ?? []).length === 0 && (
              <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma recompensa cadastrada</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Create/edit reward */}
      <Dialog open={dlg} onOpenChange={setDlg}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editing ? "Editar recompensa" : "Nova recompensa"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>Produto do cardápio (opcional)</Label>
              <Select value={productId} onValueChange={(v) => {
                setProductId(v);
                if (v !== "none" && !name.trim()) {
                  const p = productsQ.data?.find((x) => x.id === v);
                  if (p) setName(p.name);
                }
              }}>
                <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— Nenhum —</SelectItem>
                  {(productsQ.data ?? []).map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>Nome da recompensa</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Custo em pontos</Label><Input type="number" min="0" step="1" value={cost} onChange={(e) => setCost(e.target.value)} /></div>
              <div className="space-y-1"><Label>Estoque (vazio = ilimitado)</Label><Input type="number" min="0" step="1" value={stock} onChange={(e) => setStock(e.target.value)} /></div>
            </div>
            <div className="flex items-center justify-between border rounded-lg p-3">
              <div className="text-sm font-medium">Ativa</div>
              <Switch checked={active} onCheckedChange={setActive} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlg(false)}>Cancelar</Button>
            <Button onClick={save}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <RedeemWizard
        restaurantId={restaurantId}
        reward={redeemReward}
        members={membersQ.data ?? []}
        onClose={() => setRedeemReward(null)}
        onDone={() => {
          setRedeemReward(null);
          qc.invalidateQueries({ queryKey: ["loyalty-rewards", restaurantId] });
          qc.invalidateQueries({ queryKey: ["loyalty-members", restaurantId] });
          qc.invalidateQueries({ queryKey: ["loyalty-tx", restaurantId] });
          qc.invalidateQueries({ queryKey: ordersKey(restaurantId) });
        }}
      />

      <RedeemHistoryDialog
        restaurantId={restaurantId}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
      />
    </div>
  );
}

// ===================================================================
// Redeem Wizard
// ===================================================================
type WizStep = 1 | 2 | 3 | 4 | 5;

function RedeemWizard({
  restaurantId, reward, members, onClose, onDone,
}: {
  restaurantId: string;
  reward: Reward | null;
  members: Member[];
  onClose: () => void;
  onDone: () => void;
}) {
  const open = !!reward;
  const [step, setStep] = useState<WizStep>(1);

  // Step 1: variants
  const [optGroups, setOptGroups] = useState<OptGroup[]>([]);
  const [pickSelected, setPickSelected] = useState<Record<string, string[]>>({});
  const [obs, setObs] = useState("");

  // Step 2: member
  const [memberSearch, setMemberSearch] = useState("");
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);

  // Step 3: order mode
  const [mode, setMode] = useState<OrderMode>("pdv");

  // Step 4: address (delivery)
  const [cep, setCep] = useState("");
  const [addr, setAddr] = useState({ street: "", number: "", complement: "", neighborhood: "", city: "", state: "", notes: "" });
  const [delivery, setDelivery] = useState<{ fee: number; km: number; pt: GeoPoint } | null>(null);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const [payment, setPayment] = useState<PaymentMethod>("cash");

  // Restaurant info for delivery calc
  const restaurantQ = useQuery({
    queryKey: ["loyalty-redeem-restaurant", restaurantId],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("restaurants")
        .select("id, latitude, longitude, delivery_zones, delivery_fee_mode, delivery_fixed_fee, service_delivery, service_pickup")
        .eq("id", restaurantId).maybeSingle();
      return data;
    },
  });

  // Load product details + option groups when reward changes
  useEffect(() => {
    if (!reward) return;
    setStep(1);
    setObs("");
    setPickSelected({});
    setSelectedMember(null);
    setMemberSearch("");
    setMode("pdv");
    setCep(""); setAddr({ street: "", number: "", complement: "", neighborhood: "", city: "", state: "", notes: "" });
    setDelivery(null); setDeliveryError(null); setPayment("cash");
    if (reward.product_id) {
      fetchProductOptionGroups(restaurantId, reward.product_id).then(setOptGroups).catch(() => setOptGroups([]));
    } else {
      setOptGroups([]);
    }
  }, [reward, restaurantId]);

  const togglePick = (g: OptGroup, itemId: string) => {
    setPickSelected((prev) => {
      const cur = prev[g.id] ?? [];
      if (g.max_select === 1) return { ...prev, [g.id]: cur[0] === itemId ? [] : [itemId] };
      if (cur.includes(itemId)) return { ...prev, [g.id]: cur.filter((x) => x !== itemId) };
      if (cur.length >= g.max_select) return prev;
      return { ...prev, [g.id]: [...cur, itemId] };
    });
  };

  const restaurant = restaurantQ.data as any;
  const zones = (restaurant?.delivery_zones ?? []) as DeliveryZone[];
  const feeMode = (restaurant?.delivery_fee_mode ?? "radius") as "fixed" | "radius";
  const fixedFee = Number(restaurant?.delivery_fixed_fee ?? 0);
  const hasZones = zones.length > 0;
  const restaurantHasCoords = typeof restaurant?.latitude === "number" && typeof restaurant?.longitude === "number";
  const serviceDelivery = restaurant?.service_delivery !== false;
  const servicePickup = !!restaurant?.service_pickup;

  // Recalc delivery fee
  useEffect(() => {
    if (mode !== "delivery") { setDelivery(null); setDeliveryError(null); return; }
    if (feeMode === "fixed") { setDelivery({ fee: fixedFee, km: 0, pt: { lat: 0, lng: 0 } }); return; }
    if (!hasZones || !restaurantHasCoords) return;
    const cleanCep = cep.replace(/\D/g, "");
    if (cleanCep.length !== 8 || !addr.street || !addr.number || !addr.city || !addr.state) {
      setDelivery(null); return;
    }
    let cancelled = false;
    setCalculating(true);
    const t = setTimeout(async () => {
      const pt = await geocodeAddress({
        cep: cleanCep, street: addr.street, number: addr.number,
        neighborhood: addr.neighborhood, city: addr.city, state: addr.state,
      });
      if (cancelled) return;
      if (!pt) { setCalculating(false); setDeliveryError("Endereço não localizado"); return; }
      const km = haversineKm({ lat: restaurant.latitude!, lng: restaurant.longitude! }, pt);
      const found = findDeliveryFee(km, zones);
      setCalculating(false);
      if (!found) { setDeliveryError(`Fora da área (${km.toFixed(1)} km)`); setDelivery(null); return; }
      setDeliveryError(null);
      setDelivery({ fee: found.fee, km, pt });
    }, 500);
    return () => { cancelled = true; clearTimeout(t); setCalculating(false); };
  }, [mode, cep, addr.street, addr.number, addr.neighborhood, addr.city, addr.state, hasZones, restaurantHasCoords, restaurant?.latitude, restaurant?.longitude, zones, feeMode, fixedFee]);

  const lookupCep = async (raw: string) => {
    const clean = raw.replace(/\D/g, "");
    if (clean.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${clean}/json/`);
      const data = await res.json();
      if (data.erro) return toast.error("CEP não encontrado");
      setAddr((p) => ({ ...p, street: data.logradouro || "", neighborhood: data.bairro || "", city: data.localidade || "", state: data.uf || "" }));
    } catch { toast.error("Falha ao buscar CEP"); }
  };

  // Computed
  const enoughPoints = !!(reward && selectedMember && selectedMember.points >= reward.points_cost);
  const deliveryFee = mode === "delivery" ? (delivery?.fee ?? 0) : 0;
  const total = deliveryFee; // produto resgatado custa 0 em dinheiro

  const filteredMembers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return members.filter((m) => {
      if (!q) return true;
      const pd = (m.phone || "").replace(/\D/g, "");
      return m.name.toLowerCase().includes(q) || (digits && pd.includes(digits));
    });
  }, [members, memberSearch]);

  const selectedOptionsList = useMemo(() => {
    const opts: { groupName: string; itemName: string }[] = [];
    optGroups.forEach((g) => {
      (pickSelected[g.id] ?? []).forEach((iid) => {
        const it = g.items.find((x) => x.id === iid);
        if (it) opts.push({ groupName: g.name, itemName: it.name });
      });
    });
    return opts;
  }, [optGroups, pickSelected]);

  const validateStep1 = () => {
    for (const g of optGroups) {
      const cnt = (pickSelected[g.id] ?? []).length;
      if (cnt < g.min_select) { toast.error(`Selecione ao menos ${g.min_select} em "${g.name}"`); return false; }
    }
    return true;
  };

  const goNext = () => {
    if (step === 1) { if (!validateStep1()) return; setStep(2); return; }
    if (step === 2) {
      if (!selectedMember) return toast.error("Selecione um cliente");
      if (!enoughPoints) return toast.error("Cliente sem pontos suficientes");
      setStep(3); return;
    }
    if (step === 3) {
      if (mode === "delivery" && !serviceDelivery) return toast.error("Delivery indisponível");
      if (mode === "pickup" && !servicePickup) return toast.error("Retirada indisponível");
      if (mode === "delivery") setStep(4);
      else setStep(5);
      return;
    }
    if (step === 4) {
      if (!/^\d{5}-?\d{3}$/.test(cep)) return toast.error("CEP inválido");
      if (!addr.street || !addr.number || !addr.neighborhood || !addr.city || !addr.state) return toast.error("Preencha o endereço");
      if (hasZones && !delivery) return toast.error("Endereço não atendido");
      setStep(5); return;
    }
  };
  const goBack = () => {
    if (step === 1) { onClose(); return; }
    if (step === 5 && mode !== "delivery") { setStep(3); return; }
    setStep((s) => (Math.max(1, s - 1) as WizStep));
  };

  const [submitting, setSubmitting] = useState(false);
  const confirm = async () => {
    if (!reward || !selectedMember) return;
    setSubmitting(true);
    try {
      // 1) Cria pedido
      const orderType = mode === "delivery" ? "delivery" : mode === "pickup" ? "pickup" : "pdv";
      const productName = reward.name;
      const itemNotes = [
        ...selectedOptionsList.map((o) => `+ ${o.itemName}`),
        `🎁 Resgate: ${reward.points_cost} pts`,
        ...(obs ? [`Obs: ${obs}`] : []),
      ].join("\n");

      const payload: any = {
        restaurant_id: restaurantId,
        order_type: orderType,
        status: orderType === "pdv" ? "preparing" : "pending",
        customer_name: selectedMember.name,
        customer_phone: selectedMember.phone || "0000000000",
        payment_method: payment,
        subtotal: 0,
        discount: 0,
        service_fee: 0,
        delivery_fee: deliveryFee,
        total,
        loyalty_opt_in: false,
      };

      if (mode === "delivery") {
        payload.address_cep = cep;
        payload.address_street = addr.street;
        payload.address_number = addr.number;
        payload.address_complement = addr.complement || null;
        payload.address_neighborhood = addr.neighborhood;
        payload.address_city = addr.city;
        payload.address_state = addr.state;
        payload.address_notes = addr.notes || null;
        payload.delivery_distance_km = feeMode === "fixed" ? null : (delivery?.km ?? null);
        payload.delivery_latitude = feeMode === "fixed" ? null : (delivery?.pt.lat ?? null);
        payload.delivery_longitude = feeMode === "fixed" ? null : (delivery?.pt.lng ?? null);
      }

      const { data: order, error } = await supabase.from("orders").insert(payload)
        .select("id, order_number").single();
      if (error || !order) throw error || new Error("Falha ao criar pedido");

      // 2) Item do pedido (preço 0 — é resgate)
      const { error: itErr } = await supabase.from("order_items").insert({
        order_id: order.id,
        product_id: reward.product_id,
        product_name: productName,
        unit_price: 0,
        quantity: 1,
        notes: itemNotes || null,
      });
      if (itErr) throw itErr;

      // 3) Resgata pontos via RPC (atualiza saldo + estoque + transação)
      const { data: txId, error: rpcErr } = await sb.rpc("redeem_loyalty_points", {
        _restaurant_id: restaurantId,
        _member_id: selectedMember.id,
        _reward_id: reward.id,
      });
      if (rpcErr) throw rpcErr;

      // 3.1) Vincula a transação de resgate ao pedido criado
      if (txId) {
        await sb.from("loyalty_transactions").update({ order_id: order.id }).eq("id", txId);
      }

      toast.success(`Pedido #${order.order_number} criado e ${reward.points_cost} pontos resgatados`);
      onDone();
    } catch (e: any) {
      toast.error(e.message || "Erro ao processar resgate");
    } finally {
      setSubmitting(false);
    }
  };

  if (!reward) return null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Gift className="w-5 h-5" />Resgatar: {reward.name}</DialogTitle>
          <DialogDescription>
            Custo: <strong>{reward.points_cost} pontos</strong> • Etapa {step} de 5
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex gap-1 mb-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <div key={s} className={`h-1.5 flex-1 rounded-full ${s <= step ? "bg-primary" : "bg-muted"}`} />
          ))}
        </div>

        {/* STEP 1 — variants */}
        {step === 1 && (
          <div className="space-y-3">
            <div className="text-sm font-semibold">1. Selecione as variantes do produto</div>
            {optGroups.length === 0 ? (
              <div className="text-sm text-muted-foreground border rounded p-3">Este produto não possui opções. Avance para a próxima etapa.</div>
            ) : optGroups.map((g) => (
              <div key={g.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex justify-between items-center">
                  <div className="font-medium text-sm">{g.name}</div>
                  <Badge variant="outline" className="text-xs">
                    {g.min_select === g.max_select ? `Escolha ${g.max_select}` : `${g.min_select}–${g.max_select}`}
                  </Badge>
                </div>
                <div className="space-y-1">
                  {g.items.map((it) => {
                    const sel = (pickSelected[g.id] ?? []).includes(it.id);
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => togglePick(g, it.id)}
                        className={`w-full flex justify-between items-center p-2 rounded border text-sm ${sel ? "border-primary bg-primary/5" : "hover:bg-accent"}`}
                      >
                        <span className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded border flex items-center justify-center ${sel ? "bg-primary border-primary" : ""}`}>
                            {sel && <Check className="w-3 h-3 text-primary-foreground" />}
                          </div>
                          {it.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <div className="space-y-1">
              <Label className="text-xs">Observações (opcional)</Label>
              <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Sem cebola, etc." />
            </div>
          </div>
        )}

        {/* STEP 2 — member */}
        {step === 2 && (
          <div className="space-y-3">
            <div className="text-sm font-semibold">2. Selecione o cliente</div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" placeholder="Nome ou telefone" value={memberSearch} onChange={(e) => { setMemberSearch(e.target.value); setSelectedMember(null); }} />
            </div>
            <div className="border rounded-lg max-h-72 overflow-auto">
              {filteredMembers.slice(0, 80).map((m) => {
                const enough = m.points >= reward.points_cost;
                const sel = selectedMember?.id === m.id;
                return (
                  <button key={m.id} type="button" onClick={() => setSelectedMember(m)}
                    className={`w-full text-left p-2 border-b last:border-b-0 hover:bg-accent ${sel ? "bg-accent" : ""}`}>
                    <div className="flex justify-between items-center">
                      <div>
                        <div className="font-medium">{m.name}</div>
                        <div className="text-xs text-muted-foreground">{m.phone}</div>
                      </div>
                      <Badge variant={enough ? "default" : "secondary"}>{m.points} pts</Badge>
                    </div>
                  </button>
                );
              })}
              {filteredMembers.length === 0 && <div className="text-center text-muted-foreground py-6 text-sm">Nenhum cliente</div>}
            </div>
            {selectedMember && (
              <div className={`text-sm border rounded-lg p-3 ${enoughPoints ? "bg-success/10" : "bg-destructive/10 text-destructive"}`}>
                Saldo após resgate: <strong>{selectedMember.points - reward.points_cost} pontos</strong>
                {!enoughPoints && " — pontos insuficientes"}
              </div>
            )}
          </div>
        )}

        {/* STEP 3 — order mode */}
        {step === 3 && (
          <div className="space-y-3">
            <div className="text-sm font-semibold">3. Como o cliente vai receber?</div>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as OrderMode)} className="grid gap-2">
              <label className={`flex items-center gap-3 border rounded-lg p-3 cursor-pointer ${mode === "pdv" ? "border-primary bg-primary/5" : ""}`}>
                <RadioGroupItem value="pdv" />
                <ShoppingBag className="w-5 h-5" />
                <div>
                  <div className="font-medium text-sm">Balcão</div>
                  <div className="text-xs text-muted-foreground">Cliente retira no balcão imediatamente</div>
                </div>
              </label>
              <label className={`flex items-center gap-3 border rounded-lg p-3 cursor-pointer ${mode === "pickup" ? "border-primary bg-primary/5" : ""} ${!servicePickup ? "opacity-50" : ""}`}>
                <RadioGroupItem value="pickup" disabled={!servicePickup} />
                <Store className="w-5 h-5" />
                <div>
                  <div className="font-medium text-sm">Retirada</div>
                  <div className="text-xs text-muted-foreground">Cliente passa para retirar depois</div>
                </div>
              </label>
              <label className={`flex items-center gap-3 border rounded-lg p-3 cursor-pointer ${mode === "delivery" ? "border-primary bg-primary/5" : ""} ${!serviceDelivery ? "opacity-50" : ""}`}>
                <RadioGroupItem value="delivery" disabled={!serviceDelivery} />
                <Bike className="w-5 h-5" />
                <div>
                  <div className="font-medium text-sm">Delivery</div>
                  <div className="text-xs text-muted-foreground">Entregar no endereço — cliente paga taxa de entrega</div>
                </div>
              </label>
            </RadioGroup>
          </div>
        )}

        {/* STEP 4 — address */}
        {step === 4 && (
          <div className="space-y-3">
            <div className="text-sm font-semibold">4. Endereço de entrega</div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <Label className="text-xs">CEP</Label>
                <Input value={cep} onChange={(e) => { setCep(e.target.value); if (e.target.value.replace(/\D/g, "").length === 8) lookupCep(e.target.value); }} placeholder="00000-000" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Forma de pagamento da taxa</Label>
                <Select value={payment} onValueChange={(v) => setPayment(v as PaymentMethod)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Dinheiro</SelectItem>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="card_on_delivery">Cartão na entrega</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-[1fr_120px] gap-2">
              <div className="space-y-1"><Label className="text-xs">Rua</Label><Input value={addr.street} onChange={(e) => setAddr((p) => ({ ...p, street: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">Número</Label><Input value={addr.number} onChange={(e) => setAddr((p) => ({ ...p, number: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1"><Label className="text-xs">Complemento</Label><Input value={addr.complement} onChange={(e) => setAddr((p) => ({ ...p, complement: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">Bairro</Label><Input value={addr.neighborhood} onChange={(e) => setAddr((p) => ({ ...p, neighborhood: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-[1fr_80px] gap-2">
              <div className="space-y-1"><Label className="text-xs">Cidade</Label><Input value={addr.city} onChange={(e) => setAddr((p) => ({ ...p, city: e.target.value }))} /></div>
              <div className="space-y-1"><Label className="text-xs">UF</Label><Input maxLength={2} value={addr.state} onChange={(e) => setAddr((p) => ({ ...p, state: e.target.value.toUpperCase() }))} /></div>
            </div>
            <div className="space-y-1"><Label className="text-xs">Ponto de referência</Label><Input value={addr.notes} onChange={(e) => setAddr((p) => ({ ...p, notes: e.target.value }))} /></div>

            <div className={`text-sm rounded-lg p-3 ${deliveryError ? "bg-destructive/10 text-destructive" : delivery ? "bg-success/10" : "bg-muted"}`}>
              {calculating && "Calculando taxa..."}
              {!calculating && delivery && <>Taxa de entrega: <strong>{brl(delivery.fee)}</strong>{delivery.km > 0 && ` • ${delivery.km.toFixed(1)} km`}</>}
              {!calculating && !delivery && deliveryError && deliveryError}
              {!calculating && !delivery && !deliveryError && "Preencha o endereço para calcular a taxa"}
            </div>
          </div>
        )}

        {/* STEP 5 — summary */}
        {step === 5 && (
          <div className="space-y-3">
            <div className="text-sm font-semibold">5. Confirme o resgate</div>
            <div className="border rounded-lg p-3 space-y-2 text-sm">
              <div><span className="text-muted-foreground">Recompensa:</span> <strong>{reward.name}</strong></div>
              {selectedOptionsList.length > 0 && (
                <div>
                  <div className="text-muted-foreground">Variantes:</div>
                  <ul className="ml-4 list-disc">
                    {selectedOptionsList.map((o, i) => <li key={i}>{o.groupName}: {o.itemName}</li>)}
                  </ul>
                </div>
              )}
              {obs && <div><span className="text-muted-foreground">Obs:</span> {obs}</div>}
              <Separator />
              <div><span className="text-muted-foreground">Cliente:</span> <strong>{selectedMember?.name}</strong> ({formatPhone(selectedMember?.phone ?? "")})</div>
              <div><span className="text-muted-foreground">Saldo atual:</span> {selectedMember?.points} pts → após: <strong>{(selectedMember?.points ?? 0) - reward.points_cost} pts</strong></div>
              <Separator />
              <div><span className="text-muted-foreground">Modalidade:</span> <strong>{mode === "pdv" ? "Balcão" : mode === "pickup" ? "Retirada" : "Delivery"}</strong></div>
              {mode === "delivery" && (
                <>
                  <div className="text-xs text-muted-foreground">{addr.street}, {addr.number} — {addr.neighborhood}, {addr.city}/{addr.state}</div>
                  <div className="flex justify-between"><span>Taxa de entrega</span><strong>{brl(deliveryFee)}</strong></div>
                  <div className="flex justify-between"><span>Pagamento taxa</span><strong>{payment === "cash" ? "Dinheiro" : payment === "pix" ? "Pix" : "Cartão na entrega"}</strong></div>
                </>
              )}
              <Separator />
              <div className="flex justify-between text-base font-bold">
                <span>Total a pagar</span>
                <span>{brl(total)}</span>
              </div>
              <div className="text-xs text-muted-foreground">Produto resgatado com pontos — sem cobrança.</div>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:justify-between">
          <Button variant="outline" onClick={goBack} disabled={submitting}>
            <ArrowLeft className="w-4 h-4 mr-1" />{step === 1 ? "Cancelar" : "Voltar"}
          </Button>
          {step < 5 ? (
            <Button onClick={goNext}>Avançar<ArrowRight className="w-4 h-4 ml-1" /></Button>
          ) : (
            <Button onClick={confirm} disabled={submitting || !enoughPoints}>
              <Gift className="w-4 h-4 mr-1" />{submitting ? "Processando..." : "Confirmar resgate"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ===================================================================
// Redeem History Dialog
// ===================================================================
function RedeemHistoryDialog({
  restaurantId, open, onOpenChange,
}: { restaurantId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const historyQ = useQuery({
    queryKey: ["loyalty-redeem-history", restaurantId],
    enabled: open,
    queryFn: async () => {
      const { data } = await sb
        .from("loyalty_transactions")
        .select("id, member_id, order_id, points, created_at, loyalty_members(name, phone)")
        .eq("restaurant_id", restaurantId)
        .eq("type", "redeem")
        .order("created_at", { ascending: false })
        .limit(200);
      const txs = (data ?? []) as any[];
      const orderIds = txs.map((t) => t.order_id).filter(Boolean) as string[];
      let ordersMap = new Map<string, any>();
      if (orderIds.length) {
        const { data: orders } = await supabase
          .from("orders")
          .select("id, order_number, order_type, status, total, delivery_fee")
          .in("id", orderIds);
        ordersMap = new Map((orders ?? []).map((o: any) => [o.id, o]));
      }
      return txs.map((t) => ({ ...t, order: t.order_id ? ordersMap.get(t.order_id) : null }));
    },
  });

  const list = historyQ.data ?? [];
  const totalPoints = list.reduce((s, t: any) => s + Math.abs(Number(t.points || 0)), 0);

  const modeLabel = (ot?: string) => ot === "delivery" ? "Delivery" : ot === "pickup" ? "Retirada" : ot === "pdv" ? "Balcão" : "—";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><History className="w-5 h-5" />Histórico de resgates</DialogTitle>
          <DialogDescription>{list.length} resgate(s) — {totalPoints} pontos resgatados no total</DialogDescription>
        </DialogHeader>
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Pedido</TableHead>
                <TableHead>Modalidade</TableHead>
                <TableHead className="text-right">Pontos</TableHead>
                <TableHead className="text-right">Taxa entrega</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="text-xs">{new Date(t.created_at).toLocaleString("pt-BR")}</TableCell>
                  <TableCell>
                    <div className="font-medium">{t.loyalty_members?.name ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{t.loyalty_members?.phone ?? ""}</div>
                  </TableCell>
                  <TableCell className="font-mono">{t.order?.order_number ? `#${t.order.order_number}` : "—"}</TableCell>
                  <TableCell><Badge variant="outline">{modeLabel(t.order?.order_type)}</Badge></TableCell>
                  <TableCell className="text-right font-bold text-destructive">{t.points}</TableCell>
                  <TableCell className="text-right">{t.order?.delivery_fee ? brl(Number(t.order.delivery_fee)) : "—"}</TableCell>
                </TableRow>
              ))}
              {list.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhum resgate realizado ainda</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
