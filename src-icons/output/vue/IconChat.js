import { defineComponent, h } from 'vue';

export const IconChat = defineComponent({
  name: 'IconChat',
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
        h('path', {"d": "M832 384c0-176.7-143.3-320-320-320S192 207.3 192 384v128l-64 64v64h768v-64l-64-64V384zm-320 512c53 0 96-43 96-96H416c0 53 43 96 96 96z", "fillRule": "evenodd"}),
        h('path', {"d": "M448 384h128v192H448z", "fillRule": "evenodd"})
      ]
    );
  }
});
