import { defineComponent, h } from 'vue';

export const IconClipboard = defineComponent({
  name: 'IconClipboard',
  props: {
    class: {
      type: String,
      default: ''
    }
  },
  setup(props, { attrs }) {
    return () => h(
      'svg',
      {
        viewBox: '0 0 20 20',
        
        class: `tiangong-icons ${props.class}`,
        ...attrs
      },
      [
        h('path', {"d": "M704 64H320c-35.3 0-64 28.7-64 64v64h512v-64c0-35.3-28.7-64-64-64zM256 256v640c0 35.3 28.7 64 64 64h384c35.3 0 64-28.7 64-64V256H256zm288 448H384v-64h160v64zm128-192H384v-64h288v64z", "fillRule": "evenodd"})
      ]
    );
  }
});
