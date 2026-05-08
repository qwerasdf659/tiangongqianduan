import { defineComponent, h } from 'vue';

export const IconReceipt = defineComponent({
  name: 'IconReceipt',
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
        h('path', {"d": "M224 96h576c36 0 64 28 64 64v768l-96-64-96 64-96-64-96 64-96-64-96 64-96-64-96 64V160c0-36 28-64 64-64z", "fillRule": "evenodd"})
      ]
    );
  }
});
