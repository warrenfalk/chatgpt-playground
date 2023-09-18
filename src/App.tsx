import { useState } from 'react';
import './App.css'
import TextareaAutosize from 'react-textarea-autosize';
import { Configuration, OpenAIApi } from 'openai';
import keys from '../keys.json';

const configuration = new Configuration({
  apiKey: keys.openai
});
const openai = new OpenAIApi(configuration);

type Role = 'system' | 'user' | 'assistant' | 'function';

type Message = TextEntry | FunctionCallEntry

type TextEntry = {
  readonly role: Role;
  readonly content: string;
}

type FunctionCallEntry = {
  readonly role: Role;
  readonly content: undefined;
  readonly function_call: FunctionCall;
}

type FunctionCall = {
  name: string;
  arguments: string;
}

type Messages = readonly Message[];

type TextEntryProps = {
  value: string;
  onChange: (v: string) => void;
}
function TextEntry({value, onChange}: TextEntryProps) {
  return (
    <TextareaAutosize
      style={{
        flex: 1,
        backgroundColor: 'transparent',
        border: 'none',
        fontSize: 14,
        padding: 12,
        lineHeight: '20px'
      }}
      value={value}
      onChange={e => onChange(e.target.value)}
    />
  )
}

type ButtonProps = {
  text: string;
  onClick: () => void;
  disabled?: boolean;
}
function Button({text, onClick, disabled = false}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      style={{
        backgroundColor: disabled ? 'gray' : 'lightblue',
        paddingTop: 12,
        paddingBottom: 12,
        paddingLeft: 18,
        paddingRight: 18,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: 'lightblue',
        borderStyle: 'solid',
        margin: 8,
        cursor: disabled ? 'default' : 'pointer',
        color: disabled ? 'darkgray' : 'black',
      }}
      onClick={disabled ? undefined : () => onClick()}>
        {text}
    </button>
  )
}

type RoleSelectProps = {
  role: Role;
  onChange: (v: Role) => void;
}
function RoleSelect({role, onChange}: RoleSelectProps) {
  return (
    <div
      style={{
        flexBasis: 100,
        textTransform: 'uppercase',
        fontWeight: 'bold',
        fontSize: 12,
        letterSpacing: '.08em',
        padding: 12,
        lineHeight: '20px',
        cursor: 'pointer',
      }}
      onClick={() => {
        const nextRole = {'system': 'user', 'user': 'assistant', 'assistant': 'system', 'function': 'user'}[role] as Role;
        onChange(nextRole);
      }}>
        {role}
    </div>    
  )
}

type MessageEntryProps = {
  message: Message;
  onChange?: (v: Message | null) => void;
}
function MessageEntry({message, onChange}: MessageEntryProps) {
  const {role: author} = message;
  return (
    <div style={{flex: 1, display: 'flex', padding: 12, gap: 12, borderBottomColor: 'gray', borderBottomWidth: 1, borderBottomStyle: 'solid'}}>
      <RoleSelect role={author} onChange={v => onChange?.({...message, role: v})}/>
      {message.content !== undefined ?
      (
        <TextEntry value={message.content} onChange={v => onChange?.({role: author, content: v})}/>
      ) : (
        <div>
          <div>function call</div>
          <pre>{message.function_call.name}</pre>
          <pre>{JSON.stringify(message.function_call.arguments, null, 2)}</pre>
        </div>
      )}
      <div>
        <Button text="🗑️" onClick={() => onChange?.(null)} />
      </div>
    </div>
  )
}

const initial: Messages = [
  {role: 'system', content:
    // "Eres un experto conversador y profesor de español  llamada \"Fluentia\". Tu misión es ayudar a Warren (Usuario) que está aprendiendo español al conversar con él en español. Si notas alguna manera en la que puedes ayudarlo a mejorar su español, sugiérelo. Hablas con la forma muy informal y como si eres venezolana"
    // "You are an expert Spanish coach helping foreigners speak more like natives. You provide corrections when they say something that would sound weird to a native."
    `You are an expert in how native Spanish speakers talk.
    You are helping the user create flashcards.
    Sometimes the user has trouble expressing in Spanish some concept or meaning.
    He will type the concept or meaning in English and you will invent flashcards
    with a concept or meaning in english on the front (text only)
    and how he should learn to express the concept or meaning in spanish on the back.
    Sometimes the user's request will contain sufficient context. If so, you may prepend or append some invented context to the front of the card.
    The user may ask for more information.
    `,
  },
  {
    role: 'user',
    content: ''
  },
]

const emptyUserMessage: Message = {role: 'user', content: ''};

type ModelType = "gpt-4-0613" | "gpt-3.5-turbo-0613"
type Models = {
  [id in ModelType]: Model;
}
type Model = {
  pricing: ModelPricing
}
type ModelPricing = {
  prompt: number,
  completion: number,
}

type Usage = {
  [model in ModelType]?: ModelUsage
}

type ModelUsage = {
  readonly prompt: number,
  readonly completion: number,
}

const zeroUsage: ModelUsage = {
  prompt: 0,
  completion: 0,
};

function addUsage(prev: Usage, next: Usage) {
  const keys = Array.from(new Set([...Object.keys(prev), ...Object.keys(next)])) as ModelType[];
  return keys.reduce((a, v) => {
    const p = prev[v] || zeroUsage;
    const n = next[v] || zeroUsage;
    a[v] = {
      prompt: p.prompt + n.prompt,
      completion: p.completion + n.completion,
    }
    return a;
  }, {} as Usage);
}

const models: Models = {
  "gpt-4-0613": {
    pricing: {
      prompt: 0.03,
      completion: 0.06,
    }
  },
  "gpt-3.5-turbo-0613": {
    pricing: {
      prompt: 0.0015,
      completion: 0.002,
    }
  }
}

function calcPrice(usage: Usage) {
  const modelNames = Object.keys(usage) as ModelType[];
  return modelNames.reduce((total, modelId) => {
    const modelUsage = usage[modelId] || zeroUsage;
    const modelPricing = models[modelId].pricing;
    const amount =
      modelPricing.completion * modelUsage.completion * 0.001 +
      modelPricing.prompt * modelUsage.prompt * 0.001;
    return amount;
  }, 0);
}

function exists<T>(n: null | undefined | T): n is T {
  return n !== null && n !== undefined;
}

async function submitToModel(messages: Messages, usage: Usage) {
  console.log('requesting...');
  const response = await openai.createChatCompletion({
    //model: 'gpt-4-0613',
    model: 'gpt-3.5-turbo-0613',
    messages: messages.slice(),
    /*
    function_call: {name: "list_errors"},
    functions: [
      {
        name: "list_errors",
        description: "Tell the user about which parts sound unnatural",
        parameters: {
          type: "object",
          properties: {
            errors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  unnatural: {
                    type: "string",
                    description: "an unnatural part"
                  },
                  should_be: {
                    type: "string",
                    description: "what it should be"
                  },
                  because: {
                    type: "string",
                    description: "the reason why 'should_be' is better than 'wrong'"
                  }
                }
              },
              description: "Things to fix",
            },
          },
        }
      }
    ]
    */
  })
  // group the usage into an indexed structure
  const callUsage = {
    [response.data.model]: {
      completion: response.data.usage?.completion_tokens || 0,
      prompt: response.data.usage?.prompt_tokens || 0,
    }
  }
  const msgResponse = response.data.choices[0]?.message;
  if (!msgResponse) {
    return
  }
  const role = msgResponse.role;
  const fc = msgResponse.function_call || undefined;
  const content = msgResponse.content || undefined;
  const message: Message = fc ?
    {role, content: undefined, function_call: {name: fc.name!, arguments: fc.arguments!}} :
    {role, content: content!}
  //const content: string = msgResponse?.content === null ? JSON.stringify(msgResponse.function_call) : msgResponse?.content;
  //console.log('message', message);
  //setMessages();
  
  const nextMessages: Messages = [...messages, message];
  return {
    usage: addUsage(usage, callUsage),
    messages: nextMessages,
  }
  //console.log(response);
}

function App() {
  const [usage, setUsage] = useState<Usage>({});
  const [waiting, setWaiting] = useState<boolean>(() => false);
  const [rawMessages, setMessages] = useState<Messages>(() => initial);
  const [availFuncs, setAvailFuncs] = useState<string>(() => "");
  const [error, setError] = useState<string>();
  const messages = (rawMessages.length > 0 && rawMessages[rawMessages.length - 1].role === 'assistant') ? [...rawMessages, emptyUserMessage] as Messages : rawMessages;
  return (
    <>
      {/*<pre>{JSON.stringify(messages, null, 2)}</pre>*/}
      <div style={{backgroundColor: 'lightyellow', color: 'gray', padding: 8, textAlign: 'center'}}>Warning! This should only be run locally. It will expose API key</div>
      <div>
        <div>{calcPrice(usage)}</div>
      </div>
      {messages.map((m, i) => (
        <MessageEntry
          key={i}
          message={m}
          onChange={m => {
            // replace the message being edited
            const next = messages.map((pm, pi) => pi === i ? m : pm).filter(exists);
            setMessages(next);
          }}
        />
      ))}
      {error ? (
        <div style={{color: 'red'}}>
          {error}
        </div>
      ) : null}
      <div>
        <Button
          disabled={waiting}
          text="Submit"
          onClick={() => {
            setWaiting(true);
            submitToModel(messages, usage)
            .then((result) => {
              if (result) {
                setUsage(result.usage);
                setMessages(result.messages);
              }
            })
            .catch(e => {
              console.error(e);
              const es = errorToString(e);
              setError(es);
            })
            .finally(() => {
              setWaiting(false);
            })
          }}
        />
      </div>
    </>
  )
}

function errorToString(e: unknown) {
  // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
  return `${e}`
}

export default App
