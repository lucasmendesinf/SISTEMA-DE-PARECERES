# AiProf - verificacao em producao

Data: 10/09/2026. Conta: teste@gmail.com. Publicacao exibida: v11, 08/09/2026 15:02.

## Ambiente e alcance

Chromium automatizado, desktop 1440 x 900 e emulacao Android Pixel 7 com largura CSS de 412 px. Nao equivale a validacao em aparelho Android real ou PWA instalado. Nenhuma alteracao de codigo, deploy ou cadastro de dados de teste foi realizada nesta rodada. Nao foram enviados e-mails.

## Resultados confirmados

- A pagina inicial do dominio responde HTTP 200 e possui links para /app/login.php.
- /login.php responde HTTP 404. A falha anterior ocorreu por uso do caminho antigo, nao por credenciais invalidas.
- Login da conta fornecida funciona e direciona para /app/index.php.
- A conta exige aceite inicial dos termos. O aceite ficou pendente de autorizacao do titular.
- Login sem transbordamento horizontal no desktop e mobile: largura do documento igual a largura da janela.
- Abrir recuperacao de senha, voltar e abrir criacao de conta funcionam em ambos os tamanhos. Envio de codigo e criacao de conta nao testados.
- A publicacao v11 aparece na tela de login.

## Problemas e mudancas propostas

### 1. Erro JavaScript no primeiro acesso

Ao entrar com a conta sem aceite, o aplicativo solicita diversos recursos protegidos e recebe HTTP 428. O modulo tutorial-videos.js deixa escapar a excecao "Aceite os termos de uso e privacidade para continuar.". Stack observada: request, linha 35; carregamento na linha 299; loadVideos, linha 306.

Proposta: aguardar a resolucao do fluxo de aceite antes de iniciar os carregamentos protegidos e tratar explicitamente a resposta 428 nos modulos. O bloqueio de acesso pelo backend deve permanecer.

Os recursos afetados observados incluem turmas, atividades, alunos, pareceres, periodos, cabecalho, campos de experiencia, informativos, tutoriais, Drive, versao PWA e financeiro.

### 2. Data exibida na abertura merece verificacao

O painel exibiu "SEGUNDA-FEIRA, 22 DE JUNHO" durante o teste de 10/09/2026. Pode ser conteudo inicial ainda nao atualizado pelo fluxo bloqueado. Revalidar depois do aceite antes de atribuir causa ou propor correcao definitiva.

### 3. Caminho antigo de login sem redirecionamento

O caminho /login.php retorna 404, enquanto os links atuais da pagina comercial apontam corretamente para /app/login.php. Considerar redirecionamento do caminho antigo para preservar favoritos e acessos antigos. Nao ha evidencia nesta rodada de que links atuais do site estejam quebrados.

## Cobertura pendente

Cadastro e edicao de escola, turma, periodo, alunos e atividades; persistencia apos recarregar; uploads; mover e redimensionar areas de borrao por toque; reedicao de imagens; parecer e portfolio; adicionar e remover blocos; rascunho automatico e manual; continuar rascunho; finalizacao; download PDF/DOCX; Drive; envio de e-mail; atualizacao do PWA e funcionamento offline. Nenhum desses fluxos foi considerado aprovado.

## Evidencias

- production-root.png
- qa-desktop-login.png
- qa-desktop-login-layout.png
- qa-mobile-login-layout.png
- qa-desktop-recovery.png
- qa-mobile-recovery.png
- qa-desktop-signup.png
- qa-mobile-signup.png
- qa-mobile-first-access.png

Arquivos de evidencia na mesma pasta deste relatorio. Arquivos temporarios de sessao e roteiros com credenciais nao devem ser commitados.
