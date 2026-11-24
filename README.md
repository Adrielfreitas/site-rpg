# Crônicas — mesa narrativa

V1.0 inicial de uma plataforma de RPG narrativo. Aplicação web responsiva, React + TypeScript + Vite, preparada para Firebase Spark e Realtime Database. Mapas e artes da demonstração ficam em `public/maps` e são servidos pelo Firebase Hosting; assim, todos os participantes recebem os mesmos arquivos estáticos sem usar Firebase Storage.

## Rodar localmente

Requer Node.js 22 ou superior.

```bash
npm install
npm run dev
```

Sem configuração Firebase, a aplicação funciona em **modo demonstração local**. Campanhas e movimentação ficam salvas no navegador atual. Esse modo não sincroniza dados entre dispositivos.

## Conectar ao Firebase Realtime Database (plano Spark)

1. Crie um projeto no [Firebase Console](https://console.firebase.google.com/) e mantenha o plano **Spark**. Não habilite faturamento.
2. Registre um aplicativo Web no projeto.
3. Em Authentication, habilite o provedor **E-mail/senha**.
4. Habilite o **Realtime Database** no projeto; o URL já informado para este projeto é `https://site-rpg-ce9f4-default-rtdb.firebaseio.com`.
5. Publique as regras deste repositório com o Firebase CLI: `firebase deploy --only database:rules`.
6. Copie `.env.example` para `.env.local` e preencha `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN` e `VITE_FIREBASE_APP_ID` com os dados do app Web em Configurações do projeto → Seus apps. O projeto ID e a URL do banco já têm valores iniciais.
7. Execute `npm run dev` novamente e use “Conectar conta”.

O `apiKey` da configuração Web identifica o aplicativo; não substitui as regras de segurança. Publique as regras do Realtime Database antes de compartilhar o app. O banco usa nós separados para campanhas, membros, convites, fichas e mensagens; as regras limitam o acesso aos participantes autenticados. Revise as regras ao mudar o modelo de dados.

O plano Spark inclui até 100 conexões simultâneas no Realtime Database, 1 GB armazenado e 10 GB de downloads por mês. Ao atingir cotas Spark, o Firebase pode interromper o acesso ao serviço até a cota reiniciar. O Hosting também tem cotas gratuitas próprias; acompanhe o painel de uso do projeto.

### Publicar no Firebase Hosting sem custo

Instale e autentique o CLI, vincule o ID do projeto e publique:

```bash
npm install --global firebase-tools
firebase login
firebase use --add
npm run build
firebase deploy --only hosting,database:rules
```

O `firebase.json` já aponta o Hosting para `dist`. O Hosting no Spark tem cotas gratuitas. Ao atingir o limite mensal gratuito, o serviço pode ser temporariamente desativado até a próxima janela de uso; o projeto não faz upgrade automático para Blaze.

## Escopo que funciona nesta V1

- Painel, campanhas locais, abas de campanha, sessões e fichas demonstrativas.
- Criar campanha com ambientação, sistema, descrição e mapa incluído.
- Entrar por código quando Firebase estiver configurado e a conta autenticada.
- Sessão com mapa estático do projeto, tokens arrastáveis, registro e chat de demonstração.
- Autenticação por e-mail e senha e sincronização de campanhas, convites, tokens e mensagens no Realtime Database.
- Mapas próprios em SVG: `public/maps/ruins.svg` e `public/maps/station.svg`.

## Limites atuais

- Sem configuração Firebase, todo o conteúdo permanece apenas no navegador local.
- Sem Firebase configurado, tokens, chat e registro são locais. Com Firebase configurado, tokens e mensagens da sessão sincronizam entre os participantes.
- O modo Spark não permite usar Firebase Storage desde 3 de fevereiro de 2026. Por isso, uploads de mapas, retratos e tokens compartilhados foram deixados de fora. Para adicionar novos mapas neste estágio, inclua os arquivos em `public/maps` e publique uma nova versão do site.
- Ainda não há permissões completas por campo, ficha editável, movimentação validada no servidor, chamadas de voz, IA ou sistema universal de regras.
- O editor visual de regras deve usar campos e expressões controladas; a V1 não executa código fornecido pelo usuário.

## Configuração do Firebase

As variáveis `VITE_FIREBASE_*` são compiladas para a aplicação cliente. Não coloque chaves privadas, chaves de serviço ou segredos de servidor nessas variáveis. As credenciais públicas do Firebase Web precisam estar protegidas por Authentication e Security Rules.
