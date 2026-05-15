## Objetivo

Ajustar o popup **"Pedido enviado!"** que aparece para o cliente após finalizar o pedido no menu (`OrderSuccessWhatsAppDialog`).

## Alterações

1. **Remover o botão "Fechar"** do rodapé do popup.
2. **Manter o botão verde "Abrir WhatsApp"** (sem alteração).
3. **Desativar o fechamento ao clicar fora** do popup (overlay).
4. **Manter o X** no canto superior direito como única forma de fechar (além do botão Abrir WhatsApp, que também fecha após abrir o link).

## Detalhes técnicos

Arquivo: `src/components/OrderSuccessWhatsAppDialog.tsx`

- Remover o `<Button variant="ghost">Fechar</Button>` do `DialogFooter`.
- Como sobra apenas um botão, simplificar removendo o `DialogFooter` e deixando o botão "Abrir WhatsApp" diretamente.
- Adicionar `onInteractOutside={(e) => e.preventDefault()}` no `<DialogContent>` para impedir fechamento ao clicar fora.
- O X já existe por padrão no componente `DialogContent` (`src/components/ui/dialog.tsx`) — nada a fazer.

Nenhuma alteração no `WhatsAppConnectionCard` (popup de conexão no dashboard) — aquele mexido anteriormente fica como está, ou posso reverter se preferir.
