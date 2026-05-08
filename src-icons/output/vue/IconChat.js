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
        h('path', {"d": "M512 128C288 128 128 288 128 480c0 96 48 184 128 248l-48 192 192-96c36 12 72 16 112 16 224 0 384-160 384-352S736 128 512 128z", "fillRule": "evenodd"})
      ]
    );
  }
});
