import { defineComponent, h } from 'vue';

export const IconMegaphone = defineComponent({
  name: 'IconMegaphone',
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
        h('path', {"d": "M832 192v640c-128-80-256-128-384-144V336c128-16 256-64 384-144z", "fillRule": "evenodd"}),
        h('path', {"d": "M320 688l48 208h96l-48-208", "fillRule": "evenodd"}),
        h('path', {"d": "M832 416c48 24 80 64 80 96s-32 72-80 96", "fillRule": "evenodd"})
      ]
    );
  }
});
