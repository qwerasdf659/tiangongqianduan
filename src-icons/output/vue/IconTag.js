import { defineComponent, h } from 'vue';

export const IconTag = defineComponent({
  name: 'IconTag',
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
        h('path', {"d": "M476 128l384 60 60 384-392 392c-24 24-64 24-88 0L128 652c-24-24-24-64 0-88L476 128z", "fillRule": "evenodd"})
      ]
    );
  }
});
