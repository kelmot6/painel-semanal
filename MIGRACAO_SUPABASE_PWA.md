# Migração do Painel Híbrido para Supabase

Este trabalho está na branch `feat/supabase-pwa`. O painel original na branch principal não foi alterado.

## Antes de ativar a integração
1. Mantenha uma cópia do arquivo JSON exportado pelo painel em local privado.
2. Nunca envie o backup para o GitHub: ele pode conter dados pessoais.
3. Use somente a Publishable key do Supabase no navegador. Nunca use uma Secret key ou service_role key no HTML.
4. Confirme que a tabela `public.user_app_data` tem RLS ativado e políticas que limitam leitura, inserção e atualização a `auth.uid() = user_id`.

## Dados existentes
O painel atual guarda os registros principais em `localStorage` sob a chave `hibrido_routine_study_v1`; a área de rotina/estudos também usa essa chave. A exportação atual inclui `routineStudy` como parte do arquivo JSON. A migração deve preservar os dados locais e nunca substituir automaticamente dados locais por dados remotos sem uma decisão explícita do usuário.

## Regras para sincronização
- A autenticação deve ser exigida antes de acessar dados sincronizados na nuvem.
- Cada registro deve usar o UUID do usuário autenticado como `user_id`.
- A sincronização deve usar a sessão autenticada do Supabase e as políticas RLS; jamais incluir segredos privilegiados no cliente.
- Antes de mesclar dados locais e remotos, verificar se já existe conteúdo remoto. Se houver dados nos dois lados, oferecer uma escolha explícita de exportar/guardar e mesclar/restaurar; não sobrescrever silenciosamente.
- Para uso offline, manter uma cópia local e uma fila de alterações pendentes em IndexedDB. Ao reconectar, sincronizar com tratamento de conflitos e mensagens claras.
- O aplicativo só deve indicar “sincronizado” depois que o servidor confirmar a gravação.
- PWA requer manifesto, ícones, service worker e hospedagem HTTPS.

## Testes obrigatórios antes de publicar
- Criar conta, entrar, sair e redefinir senha.
- Confirmar que um usuário não consegue ler ou alterar os dados de outra conta.
- Importar o backup em uma cópia de teste e conferir registros de treino, tarefas e estudos.
- Editar offline, fechar e reabrir o aplicativo, reconectar e confirmar a sincronização.
- Testar em celular e computador.
- Não publicar até todos os testes passarem.

## Configuração ainda necessária
A API URL e a Publishable key precisam ser inseridas no arquivo de configuração do cliente durante a implementação. Não cole valores secretos em arquivos públicos. A Publishable key é própria para cliente, mas só deve ser usada com RLS e políticas corretas.
